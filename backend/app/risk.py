"""Future risk for the financial health dashboard: the Layer 2 model score and the debt capacity check.

Two answers, both from the business's own books:

1. Risk of serious financial distress within 12 months (`model`): the XGBoost model trained on real company
   accounts (ml/), scored on the ratios in `risk_features`, with its top reasons.
2. Future over-indebtedness (`debtCapacity`): can the business carry its debts, and a new loan if one is being
   considered? Standard lending arithmetic, no training data: money available for repayments each month against
   scheduled instalments (DSCR), the cash flow trend, near-term instalments against cash, recent borrowing. With a
   proposed loan, the same figures and the model score are recalculated as if the loan were taken.

Amounts are in the display currency's minor units (cents or riel), like the snapshots.
"""
from __future__ import annotations

import statistics
from datetime import datetime, timedelta
from typing import Any

from app import loan_schedule
from app.bookkeeping import REVERSAL, reversed_ids
from app.business_time import BUSINESS_TZ
from app.risk_features import MISSING_TEXT, risk_features
from app.snapshots import _debt_service, monthly_snapshots

TARGET_DSCR = 1.25      # money for repayments should cover instalments 1.25 times: a safety margin [Decision: confirm with finance]
MIN_DSCR = 1.0          # below this the instalments are not covered
CAPACITY_MONTHS = 3     # minimum complete months to judge repayment capacity
NOTE = ("Indicative, not a credit decision. The distress score comes from a model trained on real company accounts "
        "(Poland); Cambodian MSMEs differ, so read it as a level (low / moderate / high), not an exact chance.")


def _usable(snapshot: dict) -> bool:
    return bool(snapshot.get("features")) and snapshot.get("complete", True)


def _reason(code: str, text: str, **params) -> dict:
    return {"code": code, "text": text, "params": params}


def validate_proposed_loan(loan: dict) -> dict:
    """The fields a loan received carries (rules §12 Q10), for a loan not yet taken. Raises ValueError."""
    def number(name, low, high, integer=False):
        value = loan.get(name)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or (integer and not isinstance(value, int)) or not low <= value <= high:
            raise ValueError(f"{name} must be a number from {low} to {high}")
        return value
    out = {"amount": number("amount", 1, 10**13, integer=True), "termMonths": number("termMonths", 1, 360, integer=True),
           "annualInterestRate": number("annualInterestRate", 0, 100)}
    if loan.get("rateType") not in {"flat", "declining"}:
        raise ValueError("rateType must be flat or declining")
    if loan.get("repaymentFrequency") not in loan_schedule.PERIODS_PER_YEAR:
        raise ValueError("repaymentFrequency must be weekly or monthly")
    out.update(rateType=loan["rateType"], repaymentFrequency=loan["repaymentFrequency"])
    if loan.get("installmentAmount") is not None:
        out["installmentAmount"] = number("installmentAmount", 1, 10**13, integer=True)
    return out


def monthly_instalment(loan: dict) -> float:
    """The loan's instalment expressed per month (weekly instalments x 52 / 12)."""
    per_period = loan.get("installmentAmount") or loan_schedule.estimated_instalment(
        loan["amount"], float(loan["annualInterestRate"]), loan["rateType"], loan["termMonths"], loan["repaymentFrequency"])
    return per_period * loan_schedule.PERIODS_PER_YEAR[loan["repaymentFrequency"]] / 12


def _first_year_interest(loan: dict) -> float:
    """Interest paid in the loan's first 12 months (instalments minus the principal they repay)."""
    months = min(12, loan["termMonths"])
    principal = loan["amount"] * months / loan["termMonths"]
    if loan["rateType"] == "declining" and loan["annualInterestRate"] > 0 and not loan.get("installmentAmount"):
        r = loan["annualInterestRate"] / 100 / 12
        balance, interest = float(loan["amount"]), 0.0
        payment = loan["amount"] * r / (1 - (1 + r) ** -loan["termMonths"])
        for _ in range(months):
            interest += balance * r
            balance -= payment - balance * r
        return interest
    return max(0.0, monthly_instalment(loan) * months - principal)


def with_loan(snapshots: list[dict], loan: dict) -> list[dict]:
    """The snapshots as if the loan had been taken at the latest month end and spent on the business (equipment
    or stock, not kept as cash: a loan sitting in the bank would make the business look more liquid than it will
    be). The year's interest is added to the last 12 months' costs."""
    out = [dict(s) for s in snapshots]
    usable = [i for i, s in enumerate(out[-12:], start=max(0, len(out) - 12)) if _usable(s)]
    if not usable:
        return out
    monthly_interest = _first_year_interest(loan) / len(usable)
    for i in usable:
        f = dict(out[i]["features"])
        f["interest"] += monthly_interest
        f["net_profit"] -= monthly_interest
        out[i] = {**out[i], "features": f}
    f = dict(out[-1]["features"])
    due_within_year = loan["amount"] * min(1.0, 12 / loan["termMonths"])
    f["total_assets"] += loan["amount"]
    f["total_liabilities"] += loan["amount"]
    f["current_liabilities"] += due_within_year
    f["debt"] += loan["amount"]
    out[-1] = {**out[-1], "features": f}
    return out


def model_inputs(inputs: dict, ranges: dict[str, dict]) -> tuple[dict, dict[str, str]]:
    """What the model is given, and the note shown for each gap.

    In the training data a missing ratio usually meant trouble (no sales last year: 96% went bankrupt; no interest
    figure: 32%). In FINEXT many gaps are harmless, and the reason is known: no bills owed, no interest paid, under
    two years of records. Those get the value a healthy company has in training (the healthy end of its range, or
    "no change" for sales growth) instead of "missing". Gaps with no harmless reading stay missing."""
    f, reasons = dict(inputs["features"]), inputs["reasons"]
    notes = {name: MISSING_TEXT.get(code, code) for name, code in reasons.items()}
    profitable = (f.get("ebit_to_assets") if f.get("ebit_to_assets") is not None else f.get("operating_margin") or 0) >= 0
    for name, code in reasons.items():
        if name not in ranges:
            continue
        if code == "no_short_term_liabilities":                  # current, quick and cash ratio: nothing to cover
            f[name] = ranges[name]["high"]
        elif code in ("no_interest", "no_liabilities"):          # coverage with nothing to cover: as strong as profit
            f[name] = ranges[name]["high"] if profitable else ranges[name]["low"]
        elif name == "sales_growth" and code == "not_yet_available":
            f[name] = 1.0
            notes[name] = "under 2 years of records (assumed no change)"
    return f, notes


def score(snapshots: list[dict], model=None) -> dict:
    """The distress model's answer for the latest month, or why there is none."""
    inputs = risk_features(snapshots)
    if inputs["features"] is None:
        return {"available": False, "reason": "not_enough_history", "months": inputs["months"],
                "text": "Needs at least 6 complete months of records."}
    if model is None:
        from app.risk_model import default_model
        model = default_model()
    features, notes = model_inputs(inputs, model.meta.get("range", {}))
    result = model.score([features], notes=notes)[0]
    for driver in result["top_drivers"]:  # the reason code, so the app can say it in the user's language
        driver["reason"] = inputs["reasons"].get(driver["feature"])
        driver["value"] = inputs["features"][driver["feature"]]  # the business's own figure, not a substitute
    return {"available": True, "asOf": inputs["asOf"], "months": inputs["months"], "confidence": inputs["confidence"],
            "probability": result["probability"], "riskClass": result["risk_class"], "alert": result["alert"],
            "topDrivers": result["top_drivers"], "modelVersion": result["model_version"], "horizonMonths": 12, "note": NOTE}


def debt_capacity(snapshots: list[dict], transactions: list[dict], currency: str, rate: int, proposed: dict | None = None) -> dict:
    """Repayment capacity against scheduled and proposed instalments, with the cash flow trend."""
    usable = [s for s in snapshots[-12:] if _usable(s)]
    if len(usable) < CAPACITY_MONTHS or not _usable(snapshots[-1]):
        return {"available": False, "reason": "not_enough_history", "months": len(usable),
                "text": f"Needs at least {CAPACITY_MONTHS} complete months of records."}
    latest = snapshots[-1]["features"]

    # Money available for repayments each month: operating profit before depreciation, less tax and the owner's
    # usual drawings. The lower of the 3- and 12-month averages, so a recent slowdown counts straight away.
    def available(s):
        f = s["features"]
        return f["ebitda"] - f["tax"] - f["owner_drawings"]
    recent = statistics.fmean(available(s) for s in usable[-3:])
    year = statistics.fmean(available(s) for s in usable)
    capacity = min(recent, year)

    # Instalments already scheduled over the next 3 months (from the latest month end).
    start = datetime.fromtimestamp((snapshots[-1]["monthEnd"] + 1) / 1000, tz=BUSINESS_TZ)
    due, schedule_missing = _debt_service(transactions, currency, rate, start, start + timedelta(days=91))
    existing = due / 3
    revenue = statistics.fmean(s["features"]["revenue"] for s in usable)

    def dscr(instalments):
        return capacity / instalments if instalments > 0 else None

    reasons: list[dict] = []
    level = "low"

    def raise_to(new):
        nonlocal level
        order = ["low", "moderate", "high"]
        level = max(level, new, key=order.index)

    current = dscr(existing)
    if current is not None and current < MIN_DSCR:
        raise_to("high")
        reasons.append(_reason("dscr_below_one", "Money left for repayments does not cover the instalments already due.", dscr=current))
    elif current is not None and current < TARGET_DSCR:
        raise_to("moderate")
        reasons.append(_reason("dscr_thin", "Repayments take nearly all the money available for them.", dscr=current))
    if capacity <= 0 and (existing > 0 or proposed):
        raise_to("high")
        reasons.append(_reason("no_capacity", "After costs, tax and the owner's drawings, nothing is left for repayments."))
    due_14 = latest.get("instalments_due_14d")
    if due_14 and due_14 > latest["cash"]:
        raise_to("high")
        reasons.append(_reason("cash_short_for_instalments", "Instalments due in the next 14 days are more than the cash on hand.",
                               due=due_14, cash=latest["cash"]))
    weakening = []
    if (latest.get("ocf_avg_3m") or 0) < 0:
        weakening.append(_reason("negative_cash_flow", "Operating cash flow has been negative over the last 3 months."))
    if latest.get("negative_ocf_streak", 0) >= 2:
        weakening.append(_reason("cash_flow_streak", "Operating cash flow negative several months in a row.",
                                 months=latest["negative_ocf_streak"]))
    if latest.get("falling_cash_streak", 0) >= 3:
        weakening.append(_reason("falling_cash", "Cash has fallen several months in a row.", months=latest["falling_cash_streak"]))
    if year > 0 and recent < 0.8 * year:
        weakening.append(_reason("capacity_falling", "Money available for repayments is lower recently than over the year.",
                                 recent=recent, year=year))
    if weakening and (existing > 0 or latest["debt"] > 0 or proposed):  # debt counts even without a recorded schedule
        raise_to("moderate")
    reasons += weakening
    if latest.get("new_loans_6m", 0) >= 2:
        raise_to("moderate")
        reasons.append(_reason("frequent_borrowing", "Several new loans in the last 6 months.", loans=latest["new_loans_6m"]))
    if schedule_missing:
        reasons.append(_reason("schedule_missing", "A loan has no repayment schedule, so its instalments are not counted. "
                               "Add the term and rate to the loan."))

    result = {
        "available": True, "asOf": snapshots[-1]["period"], "currency": currency, "level": level,
        "monthlyCapacity": capacity, "monthlyCapacityRecent": recent, "monthlyCapacityYear": year,
        "existingMonthlyInstalments": existing, "dscr": current, "targetDscr": TARGET_DSCR,
        "affordableMonthlyInstalment": max(0.0, capacity / TARGET_DSCR - existing),
        "instalmentsToRevenue": existing / revenue if revenue > 0 else None,
        "debt": latest["debt"], "scheduleMissing": schedule_missing, "weakening": bool(weakening), "reasons": reasons,
    }
    if proposed:
        new = monthly_instalment(proposed)
        after = dscr(existing + new)
        per_unit = monthly_instalment({**proposed, "amount": 1_000_000, "installmentAmount": None}) / 1_000_000
        fits = after is not None and after >= TARGET_DSCR and level != "high"
        if after is not None and after < MIN_DSCR:
            raise_to("high")
            reasons.append(_reason("loan_not_covered", "With this loan, the instalments would be more than the money available for them.", dscr=after))
        elif not fits:
            raise_to("moderate")
            reasons.append(_reason("loan_thin", "With this loan, repayments would leave little safety margin.", dscr=after))
        result.update(level=level, proposed={
            "monthlyInstalment": new, "dscrWith": after, "fits": fits,
            # The largest amount on the same rate and term that keeps DSCR at the target (instalments scale with the amount).
            "maxAmount": int(result["affordableMonthlyInstalment"] / per_unit) if per_unit > 0 else None,
        })
    return result


def assess(transactions: list[dict], banks: list[dict], settings: dict | None = None, opening: list[dict] | None = None,
           proposed: dict | None = None, through: datetime | None = None, model=None) -> dict:
    settings = settings or {}
    currency, rate = settings.get("displayCurrency", "USD"), settings.get("rateKhrPerUsd", 4000)
    snapshots = monthly_snapshots(transactions, banks, settings, opening, through)
    live = [tx for tx in transactions if tx.get("deletedAt") is None]
    cancelled = reversed_ids(live)
    effective = [tx for tx in live if tx["id"] not in cancelled and tx.get("typeId") != REVERSAL]
    out: dict[str, Any] = {"model": score(snapshots, model), "debtCapacity": debt_capacity(snapshots, effective, currency, rate, proposed)}
    if proposed and out["model"]["available"]:
        after = score(with_loan(snapshots, proposed), model)
        out["debtCapacity"].setdefault("proposed", {})["model"] = {
            "probabilityBefore": out["model"]["probability"], "probabilityAfter": after["probability"],
            "riskClassBefore": out["model"]["riskClass"], "riskClassAfter": after["riskClass"],
            "assumption": "The loan is spent on the business (equipment or stock), not kept as cash."}
    return out
