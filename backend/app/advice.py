"""How to lower the risk: changes an owner can make, each re-scored with the same 3-month projection and 12-month model.

A change is applied to the books (the monthly snapshots), not to one ratio, because ratios move together: collecting
from customers raises cash, lowers receivable days and improves the quick ratio at once. Flow changes (costs, margin)
are applied to the last 12 months as if they had been in place, with the cash they would have saved; one-off changes
(collecting, selling stock) move money between balances at the latest month end. Only changes that apply to this
business and lower a risk by at least 1 point are offered, best first.
"""
from __future__ import annotations

import statistics

from app.stress_forecast import forecast

RECEIVABLE_DAYS_TARGET = 30
STOCK_DAYS_TARGET = 45
COST_CUT = 0.10            # share of operating costs (before depreciation)
MARGIN_GAIN = 0.02         # gross margin points
DRAWINGS_SHARE = 0.5       # owner drawings kept within this share of profit
LONGER_TERM_SCALE = 0.5    # instalments with the term doubled (approximately)
MIN_GAIN = 0.01            # a change counts if it lowers a probability by at least this much,
MIN_CONDITION_GAIN = 0.05  # or makes a stress condition this much less likely,
MIN_CASH_GAIN = 0.25       # or adds this many months of usual expenses to the cash expected in 3 months
WORSE_TOLERANCE = 0.002   # a change that raises either probability by more than this is never offered
TOP = 4


def _usable(snapshot: dict) -> bool:
    return bool(snapshot.get("features")) and snapshot.get("complete", True)


def _copy(snapshots: list[dict]) -> list[dict]:
    return [{**s, "features": dict(s["features"])} if s.get("features") else dict(s) for s in snapshots]


def _year_window(snapshots: list[dict]) -> list[int]:
    return [i for i in range(max(0, len(snapshots) - 12), len(snapshots)) if _usable(snapshots[i])]


def _improve_flows(snapshots: list[dict], gain, account: str) -> tuple[list[dict], float]:
    """Each of the last 12 months earns `gain(features)` more by lowering `account` (operating_expenses or cogs);
    the money stays in the business, so cash, assets and equity at the latest month end rise by the total."""
    out = _copy(snapshots)
    total, recent = 0.0, []
    for i in _year_window(out):
        f = out[i]["features"]
        d = max(0.0, min(gain(f), f[account]))
        f[account] -= d
        for key in ("ebit", "ebitda", "net_profit", "ocf"):
            f[key] += d
        total += d
        recent.append(d)
    last = out[-1]["features"]
    for key in ("cash", "current_assets", "total_assets", "equity"):
        last[key] += total
    if last.get("usual_monthly_expenses") is not None and account == "operating_expenses":
        last["usual_monthly_expenses"] -= statistics.fmean(recent[-3:]) if recent else 0
    return out, (statistics.fmean(recent) if recent else 0.0)


def _release(snapshots: list[dict], balance: str, amount: float) -> list[dict]:
    """Turn `amount` of a current asset (receivables, inventory) into cash at the latest month end."""
    out = _copy(snapshots)
    last = out[-1]["features"]
    last[balance] -= amount
    last["cash"] += amount
    return out


def _paid_on_time(snapshots: list[dict]) -> list[dict]:
    """Customers pay on time from now on: each month's operating cash flow no longer loses what receivables grew by."""
    out = _copy(snapshots)
    window = _year_window(out)
    for previous, i in zip(window, window[1:]):
        growth = out[i]["features"]["receivables"] - snapshots[previous]["features"]["receivables"]
        out[i]["features"]["ocf"] += max(0.0, growth)
    return out


def advise(snapshots: list[dict], transactions: list[dict], currency: str, rate: int, score, base: dict) -> list[dict]:
    """`score` is the 12-month model's scorer (app.risk.score); `base` holds the current answers."""
    window = _year_window(snapshots)
    if len(window) < 6 or not _usable(snapshots[-1]):
        return []
    last = snapshots[-1]["features"]
    months = [snapshots[i]["features"] for i in window]
    sales = sum(f["revenue"] for f in months) * 12 / len(months)
    recent = months[-6:]
    stress_before = base["stress3m"]["probability"] if base["stress3m"]["available"] else None
    model_before = base["model"]["probability"] if base["model"]["available"] else None

    candidates: list[tuple[str, dict, list[dict] | None, dict]] = []  # code, params, changed books (or None), projection options
    if sales > 0:
        days = last["receivables"] / sales * 365
        if days > RECEIVABLE_DAYS_TARGET * 1.5:
            amount = last["receivables"] - sales * RECEIVABLE_DAYS_TARGET / 365
            candidates.append(("collect_receivables", {"daysNow": days, "daysTarget": RECEIVABLE_DAYS_TARGET, "cash": amount},
                               _release(_paid_on_time(snapshots), "receivables", amount), {}))
        stock_days = last["inventory"] / sales * 365
        if stock_days > STOCK_DAYS_TARGET * 1.33:
            amount = last["inventory"] - sales * STOCK_DAYS_TARGET / 365
            candidates.append(("reduce_stock", {"daysNow": stock_days, "daysTarget": STOCK_DAYS_TARGET, "cash": amount},
                               _release(snapshots, "inventory", amount), {}))
    loss = -statistics.fmean(min(f["net_profit"], f["ocf"]) for f in recent)
    if loss > 0:  # what it takes to stop losing money, and what that would do to the risk
        books, monthly = _improve_flows(snapshots, lambda f: loss, "operating_expenses")
        costs = statistics.fmean(f["operating_expenses"] - f["depreciation"] for f in recent)
        revenue = statistics.fmean(f["revenue"] for f in recent)
        candidates.append(("break_even", {"monthlyGap": loss, "costCut": loss / costs if costs > 0 else None,
                                          "marginPoints": loss / revenue if revenue > 0 else None}, books, {}))
    if any(f["operating_expenses"] - f["depreciation"] > 0 for f in months):
        books, monthly = _improve_flows(snapshots, lambda f: COST_CUT * (f["operating_expenses"] - f["depreciation"]), "operating_expenses")
        candidates.append(("cut_costs", {"share": COST_CUT, "monthly": monthly}, books, {}))
    if any(f["cogs"] > 0 for f in months):
        books, monthly = _improve_flows(snapshots, lambda f: MARGIN_GAIN * f["revenue"], "cogs")
        candidates.append(("raise_margin", {"points": MARGIN_GAIN, "monthly": monthly}, books, {}))
    drawings = statistics.fmean(f["owner_drawings"] for f in recent)
    profit = statistics.fmean(f["net_profit"] for f in recent)
    cap = DRAWINGS_SHARE * max(profit, 0.0)
    if drawings > cap and drawings > 0:
        candidates.append(("limit_drawings", {"monthlyNow": drawings, "monthlyCap": cap}, None, {"drawings_cap": cap}))
    if base["stress3m"]["available"] and sum(base["stress3m"]["instalments"]) > 0:
        now = sum(base["stress3m"]["instalments"]) / len(base["stress3m"]["instalments"])
        candidates.append(("longer_loan_term", {"monthlyNow": now, "monthlyAfter": now * LONGER_TERM_SCALE}, None,
                           {"instalment_scale": LONGER_TERM_SCALE}))

    usual = base["stress3m"].get("usualMonthlyExpenses") if base["stress3m"]["available"] else None
    low_risk = all(answer["riskClass"] == "low" for answer in (base["stress3m"], base["model"]) if answer["available"])
    advice = []
    for code, params, books, options in candidates:
        changed = books or snapshots
        stress = forecast(changed, transactions, currency, rate, **options) if stress_before is not None else None
        model_after = score(changed)["probability"] if books is not None and model_before is not None else None
        item = {"code": code, "params": params, "currency": currency, "stress3m": None, "model12m": None, "conditions": {}, "cash3m": None}
        gains = []
        if stress:
            item["stress3m"] = {"before": stress_before, "after": stress["probability"]}
            gains.append(stress_before - stress["probability"])
            for name, before in base["stress3m"]["conditions"].items():
                after = stress["conditions"][name]
                if before - after >= MIN_CONDITION_GAIN:
                    item["conditions"][name] = {"before": before, "after": after}
            item["cash3m"] = {"before": base["stress3m"]["cash"][-1]["median"], "after": stress["cash"][-1]["median"]}
        if model_after is not None:
            item["model12m"] = {"before": model_before, "after": model_after}
            gains.append(model_before - model_after)
        cash_gain = (item["cash3m"]["after"] - item["cash3m"]["before"]) / usual if item["cash3m"] and usual else 0.0
        item["gain"] = max(gains, default=0.0)
        if min(gains, default=0.0) < -WORSE_TOLERANCE:
            continue  # never advise something that makes either risk worse
        if low_risk and not item["conditions"]:
            continue  # nothing to fix: the card says the risk is low instead
        if item["gain"] >= MIN_GAIN or item["conditions"] or cash_gain >= MIN_CASH_GAIN:
            item["rank"] = (item["gain"], len(item["conditions"]), cash_gain)
            advice.append(item)
    advice.sort(key=lambda a: a.pop("rank"), reverse=True)
    return advice[:TOP]
