"""Unusual entries: likely mistakes in the books, found from the business's own history.

Cleaner books make the risk answers more trustworthy, so the app asks the owner to look at entries that:

- `duplicate`: repeat another entry of the same type, amount, category and party within two days;
- `spike` / `extra_zero`: are far above what this kind of cost usually is (a robust median and spread of earlier
  entries); about 10 or 100 times the usual amount reads as a typing slip (an extra zero);
- `maybe_expense`: are money in for exactly a regular cost's amount, in a month where that cost is missing
  (rent recorded as income, for example);
- `future_date`: are dated after today.

Only recent entries are flagged; cancelled entries and their reversals are ignored. Nothing is changed: the owner
opens the entry and fixes it, or says it is right.
"""
from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import datetime
from typing import Any

from app.bookkeeping import REVERSAL, SETTLEMENT_TYPES, reversed_ids
from app.business_time import BUSINESS_TZ

DAY_MS = 86_400_000
DUPLICATE_WINDOW_MS = 2 * DAY_MS
RECENT_MS = 120 * DAY_MS     # entries older than this are not flagged
MIN_HISTORY = 5              # earlier entries of the same kind before a spike can be judged
SPIKE_TIMES = 3.0            # at least this many times the usual amount…
SPIKE_SPREADS = 4.0          # …and this many robust spreads above it
MIN_REPEATS = 3              # months a cost must repeat at the same amount to count as regular


def _month(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, BUSINESS_TZ).strftime("%Y-%m")


def _summary(tx: dict[str, Any]) -> dict[str, Any]:
    return {"id": tx["id"], "title": tx.get("title") or "", "typeId": tx["typeId"], "direction": tx["direction"],
            "amount": tx["amount"], "currency": tx["currency"], "occurredAt": tx["occurredAt"]}


def find_unusual(transactions: list[dict[str, Any]], now: datetime | None = None) -> list[dict[str, Any]]:
    """Each flagged entry once (its strongest reason), newest first."""
    now_ms = int((now or datetime.now(BUSINESS_TZ)).timestamp() * 1000)
    live = [tx for tx in transactions if tx.get("deletedAt") is None]
    cancelled = reversed_ids(live)
    entries = sorted((tx for tx in live if tx["id"] not in cancelled and tx["typeId"] != REVERSAL), key=lambda tx: tx["occurredAt"])
    flags: dict[str, dict[str, Any]] = {}

    def flag(tx: dict[str, Any], code: str, **params: Any) -> None:
        if tx["occurredAt"] >= now_ms - RECENT_MS and tx["id"] not in flags:
            flags[tx["id"]] = {**_summary(tx), "code": code, "params": params}

    # Dated in the future: almost always a slip when picking the date.
    for tx in entries:
        if tx["occurredAt"] > now_ms + DAY_MS:
            flag(tx, "future_date")

    # Same entry twice within two days.
    same: dict[tuple, list[dict]] = defaultdict(list)
    for tx in entries:
        if tx["direction"] == "move":
            continue
        key = (tx["typeId"], tx["amount"], tx["currency"], tx.get("categoryId"), (tx.get("counterparty") or "").strip().lower())
        for earlier in same[key]:
            if tx["occurredAt"] - earlier["occurredAt"] <= DUPLICATE_WINDOW_MS:
                flag(tx, "duplicate", otherId=earlier["id"], otherAt=earlier["occurredAt"])
                break
        same[key].append(tx)

    # Far above the usual amount for this kind of cost.
    history: dict[tuple, list[int]] = defaultdict(list)
    for tx in entries:
        if tx["direction"] != "out" or tx["typeId"] in SETTLEMENT_TYPES:
            continue
        key = (tx["typeId"], tx.get("categoryId"), tx["currency"])
        earlier = history[key]
        if len(earlier) >= MIN_HISTORY:
            usual = statistics.median(earlier)
            spread = 1.4826 * statistics.median(abs(a - usual) for a in earlier)
            times = tx["amount"] / usual if usual > 0 else 0.0
            if usual > 0 and times >= SPIKE_TIMES and tx["amount"] > usual + SPIKE_SPREADS * spread:
                slip = any(abs(times - k) <= 0.1 * k for k in (10, 100))
                flag(tx, "extra_zero" if slip else "spike", usual=usual, times=round(times, 1))
        earlier.append(tx["amount"])

    # Money in for exactly a regular cost's amount, in a month where that cost is missing.
    months_by_cost: dict[tuple, set[str]] = defaultdict(set)
    for tx in entries:
        if tx["direction"] == "out" and tx["typeId"] not in SETTLEMENT_TYPES:
            months_by_cost[(tx["amount"], tx["currency"], tx["typeId"])].add(_month(tx["occurredAt"]))
    regular = {key: months for key, months in months_by_cost.items() if len(months) >= MIN_REPEATS}
    for tx in entries:
        if tx["direction"] != "in" or tx["typeId"] in SETTLEMENT_TYPES:
            continue
        for (amount, currency, type_id), months in regular.items():
            if tx["amount"] == amount and tx["currency"] == currency and _month(tx["occurredAt"]) not in months:
                flag(tx, "maybe_expense", usualType=type_id)
                break

    return sorted(flags.values(), key=lambda item: item["occurredAt"], reverse=True)
