"""Loan readiness: a transparent 0-100 score built from the business's own records.

This is decision *support* for the SME and for lenders, not a credit decision. Every
check is listed with its status so the score can always be explained.

Scoring
- Each check is pass (100), warn (60) or fail (15); checks without enough data are left out.
- A pillar's score is the average of its available checks.
- The overall score is the weight-averaged pillar score over pillars that have data.
- Coverage is the weighted share of checks that had data. Below 50% coverage, or with
  fewer than MIN_ACTIVE_MONTHS months of entries, the result is "insufficient_data"
  whatever the score, so a thin record can't look strong (an empty ledger has no
  repayments due and balanced books, which would otherwise score well).
"""

MIN_ACTIVE_MONTHS = 3

from dataclasses import dataclass

STATUS_POINTS = {"pass": 100, "warn": 60, "fail": 15}

PILLARS = [
    # id, weight, English label (the app translates by id)
    ("repayment", 30, "Ability to repay"),
    ("strength", 25, "Financial strength"),
    ("profitability", 20, "Profitability"),
    ("records", 15, "Record keeping"),
    ("documents", 10, "Registration & documents"),
]

RATIO_CHECKS = {
    # ratio id -> pillar, display format
    "dscr": ("repayment", "times"),
    "interest_coverage": ("repayment", "times"),
    "current_ratio": ("strength", "times"),
    "debt_to_equity": ("strength", "times"),
    "debt_to_asset": ("strength", "percent"),
    "net_margin": ("profitability", "percent"),
    "gross_margin": ("profitability", "percent"),
    "revenue_growth": ("profitability", "percent"),
}

RATIO_STATUS = {"green": "pass", "yellow": "warn", "red": "fail", "not_available": "missing"}


@dataclass
class ReadinessInputs:
    ratios: list[dict]                 # output of accounting.ratios()["ratios"]
    active_months: int                 # months with activity in the recent window
    window_months: int                 # size of that window (6)
    books_balance: bool                # balance sheet and cash flow checks are zero, no validation issues
    days_since_last_entry: int | None  # None when there are no entries
    registration_status: str | None    # 'registered' | 'unregistered' | None
    documents: set[str]                # uploaded document kinds


def _check(check_id: str, pillar: str, label: str, status: str, value=None, fmt: str | None = None, note: str | None = None) -> dict:
    return {"id": check_id, "pillar": pillar, "label": label, "status": status, "value": value, "format": fmt, "note": note}


def assess(inputs: ReadinessInputs) -> dict:
    checks: list[dict] = []

    for ratio in inputs.ratios:
        spec = RATIO_CHECKS.get(ratio["id"])
        if not spec:
            continue
        pillar, fmt = spec
        checks.append(_check(ratio["id"], pillar, ratio["label"], RATIO_STATUS[ratio["status"]],
                             ratio.get("value"), fmt, ratio.get("message")))

    months, window = inputs.active_months, inputs.window_months
    checks.append(_check("history", "records", "Months of bookkeeping",
                         "pass" if months >= window else "warn" if months >= 3 else "fail",
                         months, "months", f"{months} of the last {window} months have entries"))
    checks.append(_check("books_balance", "records", "Books balance",
                         "pass" if inputs.books_balance else "fail"))
    days = inputs.days_since_last_entry
    checks.append(_check("recent_activity", "records", "Recent entries",
                         "fail" if days is None else "pass" if days <= 30 else "warn" if days <= 60 else "fail",
                         days, "days"))

    registration = inputs.registration_status
    checks.append(_check("registered", "documents", "Business registered",
                         "pass" if registration == "registered" else "fail" if registration == "unregistered" else "missing"))
    checks.append(_check("patent_tax", "documents", "Patent Tax certificate uploaded",
                         "pass" if "patent_tax" in inputs.documents else "fail"))
    checks.append(_check("certificate_of_incorporation", "documents", "Certificate of Incorporation uploaded",
                         "pass" if "certificate_of_incorporation" in inputs.documents else "fail"))

    pillars = []
    weighted_total = available_weight = coverage = 0.0
    for pillar_id, weight, label in PILLARS:
        own = [c for c in checks if c["pillar"] == pillar_id]
        scored = [STATUS_POINTS[c["status"]] for c in own if c["status"] in STATUS_POINTS]
        score = round(sum(scored) / len(scored)) if scored else None
        pillars.append({"id": pillar_id, "label": label, "weight": weight, "score": score})
        if own:
            coverage += weight * len(scored) / len(own)
        if score is not None:
            weighted_total += weight * score
            available_weight += weight

    coverage = round(coverage / sum(w for _, w, _ in PILLARS), 2)
    score = round(weighted_total / available_weight) if available_weight else None
    repayment_fail = any(c["pillar"] == "repayment" and c["status"] == "fail" for c in checks)
    if score is None or coverage < 0.5 or inputs.active_months < MIN_ACTIVE_MONTHS:
        level = "insufficient_data"
    elif score >= 70 and not repayment_fail:
        level = "ready"
    elif score >= 50:
        level = "almost"
    else:
        level = "not_ready"

    weights = {pillar_id: weight for pillar_id, weight, _ in PILLARS}
    order = {"fail": 0, "warn": 1}
    improvements = [c["id"] for c in sorted(
        (c for c in checks if c["status"] in order),
        key=lambda c: (order[c["status"]], -weights[c["pillar"]]),
    )]
    missing = [c["id"] for c in checks if c["status"] == "missing"]

    return {"score": score, "level": level, "coverage": coverage, "pillars": pillars,
            "checks": checks, "improvements": improvements, "missing": missing}
