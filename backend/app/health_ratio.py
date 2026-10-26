"""Financial health ratio thresholds and status evaluation."""

RATIO_RULES = {
    "current_ratio": {"benchmark": 1.5, "yellow": 1.2, "red": 1.0, "better": "higher"},
    "gross_margin": {"benchmark": .33, "yellow": .28, "red": .23, "better": "higher"},
    "net_margin": {"benchmark": .056, "yellow": .03, "red": 0, "better": "higher"},
    "ebitda_margin": {"benchmark": .10, "yellow": .05, "red": 0, "better": "higher"},
    "inventory_days": {"benchmark": 50, "yellow": 60, "red": 70, "better": "lower"},
    "receivable_days": {"benchmark": 30, "yellow": 45, "red": 60, "better": "lower"},
    "revenue_growth": {"benchmark": .03, "yellow": -.10, "red": -.25, "better": "higher"},
    "operating_expense_ratio": {"benchmark": .25, "yellow": .30, "red": .35, "better": "lower"},
    "debt_to_equity": {"benchmark": 1, "yellow": 2, "red": 3, "better": "lower"},
    "interest_coverage": {"benchmark": 5, "yellow": 3, "red": 1.5, "better": "higher"},
    "debt_to_asset": {"benchmark": .4, "yellow": .5, "red": .7, "better": "lower"},
    "dscr": {"benchmark": 1.5, "yellow": 1.25, "red": 1, "better": "higher"},
}


def ratio_status(value: float | None, rule: dict, ready: bool) -> tuple[str, str | None]:
    if value is None or not ready:
        return "not_available", "Not enough data yet"
    if rule["better"] == "higher":
        status = "red" if value <= rule["red"] else "yellow" if value <= rule["yellow"] else "green"
    else:
        status = "red" if value >= rule["red"] else "yellow" if value >= rule["yellow"] else "green"
    return status, None
