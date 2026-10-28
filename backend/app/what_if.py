"""What-if: the owner moves a few levers and both AI answers are recalculated on the changed books.

The same approach as the advice (app/advice.py): a change is applied to a copy of the monthly snapshots, not to one
ratio, then the 3-month projection and the 12-month model score the changed books. Levers combine:

- `priceChange`: sell at higher prices, same volume (share, 0 to 0.3). Every extra riel is profit.
- `costCut`: lower running costs before depreciation (share, 0 to 0.5).
- `collectDays`: customers pay within this many days of sales (only counts when faster than now).
- `drawingsCut`: the owner takes out less each month (share, 0 to 1). Changes the 3-month projection only, like the
  "limit drawings" advice: the 12-month model reads company accounts, which have no owner drawings line.
"""
from __future__ import annotations

import statistics

from app.advice import _copy, _improve_flows, _paid_on_time, _release, _usable, _year_window
from app.stress_forecast import forecast

LIMITS = {"priceChange": (0.0, 0.3), "costCut": (0.0, 0.5), "collectDays": (0.0, 365.0), "drawingsCut": (0.0, 1.0)}
MIN_MONTHS = 6


def validate(changes: dict) -> dict:
    """The levers that were sent, each a number within its range. Raises ValueError."""
    out = {}
    for name, value in changes.items():
        if name not in LIMITS:
            raise ValueError(f"unknown lever: {name}")
        if value is None:
            continue
        low, high = LIMITS[name]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
            raise ValueError(f"{name} must be a number from {low:g} to {high:g}")
        out[name] = float(value)
    return out


def _raise_prices(snapshots: list[dict], share: float) -> list[dict]:
    """Each of the last 12 months sells the same for `share` more; the extra is profit and stays in the business."""
    out = _copy(snapshots)
    total = 0.0
    for i in _year_window(out):
        f = out[i]["features"]
        extra = share * f["revenue"]
        f["revenue"] += extra
        for key in ("ebit", "ebitda", "net_profit", "ocf"):
            f[key] += extra
        total += extra
    last = out[-1]["features"]
    for key in ("cash", "current_assets", "total_assets", "equity"):
        last[key] += total
    return out


def _figures(snapshots: list[dict]) -> dict:
    """Plain figures shown beside the AI answers: profit per sale, days customers take to pay, monthly profit."""
    months = [snapshots[i]["features"] for i in _year_window(snapshots)]
    revenue = sum(f["revenue"] for f in months)
    sales_year = revenue * 12 / len(months) if months else 0.0
    last = snapshots[-1]["features"]
    return {
        "netMargin": sum(f["net_profit"] for f in months) / revenue if revenue > 0 else None,
        "receivableDays": last["receivables"] / sales_year * 365 if sales_year > 0 else None,
        "monthlyProfit": statistics.fmean(f["net_profit"] for f in months) if months else 0.0,
    }


def _answers(snapshots, transactions, currency, rate, score, drawings_cap=None) -> dict:
    stress = forecast(snapshots, transactions, currency, rate, drawings_cap=drawings_cap)
    model = score(snapshots)
    return {
        "stress3m": {"probability": stress["probability"], "riskClass": stress["riskClass"]} if stress["available"] else None,
        "model12m": {"probability": model["probability"], "riskClass": model["riskClass"]} if model["available"] else None,
        "cash3m": stress["cash"][-1]["median"] if stress["available"] else None,
        **_figures(snapshots),
    }


def what_if(snapshots: list[dict], transactions: list[dict], currency: str, rate: int, score, changes: dict) -> dict:
    """`score` is the 12-month model's scorer (app.risk.score). Returns today's answers, the changed ones, and the
    business's current figures so the app can label each lever in money."""
    window = _year_window(snapshots)
    if len(window) < MIN_MONTHS or not _usable(snapshots[-1]):
        return {"available": False, "reason": "not_enough_history", "months": len(window)}

    recent = [snapshots[i]["features"] for i in window][-6:]
    last = snapshots[-1]["features"]
    sales_year = statistics.fmean(f["revenue"] for f in recent) * 12
    baseline = {
        "currency": currency,
        "monthlyRevenue": statistics.fmean(f["revenue"] for f in recent),
        "monthlyCosts": statistics.fmean(f["operating_expenses"] - f["depreciation"] for f in recent),
        "monthlyDrawings": statistics.fmean(f["owner_drawings"] for f in recent),
        "receivableDays": last["receivables"] / sales_year * 365 if sales_year > 0 else None,
    }

    books = snapshots
    if changes.get("priceChange"):
        books = _raise_prices(books, changes["priceChange"])
    if changes.get("costCut"):
        books, _ = _improve_flows(books, lambda f: changes["costCut"] * max(0.0, f["operating_expenses"] - f["depreciation"]), "operating_expenses")
    target = changes.get("collectDays")
    if target is not None and sales_year > 0:
        amount = last["receivables"] - sales_year * target / 365
        if amount > 0:
            books = _release(_paid_on_time(books), "receivables", amount)
    cap = baseline["monthlyDrawings"] * (1 - changes["drawingsCut"]) if changes.get("drawingsCut") else None

    return {
        "available": True,
        "baseline": baseline,
        "before": _answers(snapshots, transactions, currency, rate, score),
        "after": _answers(books, transactions, currency, rate, score, drawings_cap=cap),
    }
