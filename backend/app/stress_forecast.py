"""Probability of financial stress in the next 3 months (pipeline spec C3), from the business's own books.

The spec's stress definition, for the next three months: cash runway below half a month (two weeks) of usual
expenses in any of them, operating cash flow negative in all three, or debt service cover (EBITDA / instalments)
of 1.0 or less over the three.

There are no recorded outcomes of FINEXT businesses to train a model on, so this is a projection, not a trained model:
it starts from today's cash and the loan instalments already scheduled for each coming month, and lets each coming
month repeat one of the business's own last 6 complete months (its operating cash flow, operating profit before
depreciation and owner drawings together, as they happened). Over many such futures, the share that meets a stress
condition is the probability. Seeded from the books, so the same books always give the same answer.

The 12-month distress answer is the trained model (app/risk.py); this is the short-term companion.
"""
from __future__ import annotations

import hashlib
import statistics
from datetime import datetime

import numpy as np

from app.business_time import BUSINESS_TZ
from app.snapshots import _debt_service, _month_bounds, _month_index

HORIZON = 3
SAMPLE_MONTHS = 6       # the recent months each future month is drawn from
MIN_MONTHS = 6
PATHS = 2_000
RUNWAY_FLOOR = 0.5      # months of usual expenses (two weeks)
DSCR_FLOOR = 1.0
BANDS = {"low": 0.10, "high": 0.30}  # same levels as the 12-month answer
NOTE = ("A projection from your own last 6 months and the loan instalments already scheduled, not a guarantee. "
        "Purchases of equipment, new loans and one-off events are not included.")


def _usable(snapshot: dict) -> bool:
    return bool(snapshot.get("features")) and snapshot.get("complete", True)


def _level(p: float) -> str:
    return "high" if p > BANDS["high"] else "moderate" if p >= BANDS["low"] else "low"


def stressed_now(features: dict) -> list[str]:
    """Which stress conditions already hold this month (the spec separates future stress from a problem now)."""
    now = []
    if features.get("cash_runway") is not None and features["cash_runway"] < RUNWAY_FLOOR:
        now.append("cash_runway")
    if features.get("negative_ocf_streak", 0) >= HORIZON:
        now.append("negative_cash_flow")
    if features.get("dscr") is not None and features["dscr"] <= DSCR_FLOOR:
        now.append("dscr")
    return now


def forecast(snapshots: list[dict], transactions: list[dict], currency: str, rate: int,
             extra_instalment: float = 0.0, paths: int = PATHS, instalment_scale: float = 1.0,
             drawings_cap: float | None = None) -> dict:
    """The 3-month stress probability. `extra_instalment` adds a proposed loan's monthly instalment; for advice,
    `instalment_scale` scales the scheduled instalments (a longer term) and `drawings_cap` limits owner drawings."""
    usable = [s for s in snapshots[-12:] if _usable(s)]
    if len(usable) < MIN_MONTHS or not _usable(snapshots[-1]):
        return {"available": False, "reason": "not_enough_history", "months": len(usable),
                "text": f"Needs at least {MIN_MONTHS} complete months of records."}
    latest = snapshots[-1]["features"]
    recent = usable[-SAMPLE_MONTHS:]
    ocf = np.array([s["features"]["ocf"] for s in recent], dtype=float)
    ebitda = np.array([s["features"]["ebitda"] for s in recent], dtype=float)
    drawings = np.array([s["features"]["owner_drawings"] for s in recent], dtype=float)
    if drawings_cap is not None:
        drawings = np.minimum(drawings, max(0.0, drawings_cap))
    usual = latest.get("usual_monthly_expenses")
    if usual is None:
        usual = statistics.fmean(s["features"]["cogs"] + s["features"]["operating_expenses"] - s["features"]["depreciation"] for s in recent)

    # Instalments already scheduled for each coming month (plus a proposed loan's).
    first = _month_index(datetime.fromtimestamp((snapshots[-1]["monthEnd"] + 1) / 1000, tz=BUSINESS_TZ))
    instalments, schedule_missing = [], False
    for k in range(HORIZON):
        start, end = _month_bounds(first + k)
        due, missing = _debt_service(transactions, currency, rate, start, end)
        instalments.append(due * instalment_scale + extra_instalment)
        schedule_missing |= missing
    instalments = np.array(instalments, dtype=float)

    # Each future month repeats one of the recent months, chosen at random. The draws depend only on the month and the
    # number of months, so the same books always give the same answer, and a what-if (advice, a proposed loan) is
    # compared on the same draws: the difference is the change itself, not chance.
    seed = int(hashlib.sha256(repr((snapshots[-1]["period"], len(recent))).encode()).hexdigest()[:8], 16)
    picks = np.random.default_rng(seed).integers(len(recent), size=(paths, HORIZON))
    path_ocf, path_ebitda = ocf[picks], ebitda[picks]
    cash = latest["cash"] + np.cumsum(path_ocf - drawings[picks] - instalments, axis=1)

    runway = (cash < RUNWAY_FLOOR * usual).any(axis=1) if usual > 0 else np.zeros(paths, dtype=bool)
    negative = (path_ocf < 0).all(axis=1)
    total_due = instalments.sum()
    dscr = (path_ebitda.sum(axis=1) <= DSCR_FLOOR * total_due) if total_due > 0 else np.zeros(paths, dtype=bool)
    stressed = runway | negative | dscr
    p = float(stressed.mean())

    months = [f"{_month_bounds(first + k)[0]:%Y-%m}" for k in range(HORIZON)]
    return {
        "available": True, "asOf": snapshots[-1]["period"], "horizonMonths": HORIZON, "method": "own_history_projection",
        "probability": p, "riskClass": _level(p), "paths": paths, "basedOnMonths": len(recent), "currency": currency,
        # Share of all futures in which each condition is met (they can overlap).
        "conditions": {"cash_runway": float(runway.mean()), "negative_cash_flow": float(negative.mean()), "dscr": float(dscr.mean())},
        "cash": [{"month": m, "median": float(np.median(cash[:, k])), "low": float(np.percentile(cash[:, k], 10)),
                  "high": float(np.percentile(cash[:, k], 90))} for k, m in enumerate(months)],
        "startingCash": latest["cash"], "usualMonthlyExpenses": usual, "runwayFloor": RUNWAY_FLOOR * usual,
        "instalments": instalments.tolist(), "scheduleMissing": schedule_missing,
        "stressedNow": stressed_now(latest), "note": NOTE,
    }
