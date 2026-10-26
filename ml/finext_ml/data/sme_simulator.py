"""Synthetic Cambodian MSMEs for the first FINEXT training set (AI pipeline spec C4).

SYNTHETIC DATA: simulated businesses, not customer records. A model trained on it learns the patterns written
here, so describe its output as "likely deterioration" and retrain once real outcomes exist.

Each business is simulated day by day and recorded as ordinary FINEXT entries (the same shape the app syncs).
Those entries go through the backend's real posting rules, ledger and Stage A snapshot code
(`app.snapshots.monthly_snapshots`), and the `stress_3m` label is read from the snapshots that follow.

What is simulated:
- Business types (grocery, bakery, service, trader) with their own sales, margins, credit use, stock cycle
  and costs, plus seasons (Khmer New Year, Pchum Ben, the rainy season) and day-to-day noise.
- Cash pressure: bills are paid only when there is cash. Otherwise rent, wages and utilities are recorded as
  unpaid, supplier bills wait, restocking shrinks (and sales are lost) and loan instalments fall into arrears.
- Problems for some businesses: falling demand, supplier price rises, late or defaulting customers,
  over-borrowing, a large equipment purchase, rising owner drawings.
- Imperfect records: sales recorded a day late (days without entries), duplicate entries (most later
  reversed), sales without a cost (estimated COGS).
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np

BACKEND = Path(__file__).resolve().parents[3] / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app import loan_schedule  # noqa: E402
from app.business_time import BUSINESS_TZ  # noqa: E402
from app.snapshots import monthly_snapshots  # noqa: E402

CASH = {"id": "cash", "createdAt": 0, "updatedAt": 0, "deletedAt": None, "syncStatus": "synced",
        "name": "Cash", "kind": "cash", "logoKey": None}
SETTINGS = {"id": "app", "displayCurrency": "USD", "rateKhrPerUsd": 4000}

# Ranges per business type: (low, high), drawn uniformly per business. Amounts in USD.
ARCHETYPES = {
    "grocery": {"daily_sales": (120, 400), "cost_share": (0.72, 0.82), "credit_share": (0.03, 0.15), "stock_days": (20, 40),
                "rent": (150, 400), "wages": (0, 300), "utilities": (30, 80), "supplies": (0, 0), "season": (0.15, 0.35)},
    "bakery": {"daily_sales": (80, 250), "cost_share": (0.45, 0.60), "credit_share": (0.05, 0.20), "stock_days": (5, 12),
               "rent": (120, 300), "wages": (100, 350), "utilities": (60, 150), "supplies": (0, 0), "season": (0.15, 0.35)},
    "service": {"daily_sales": (40, 180), "cost_share": (0, 0), "credit_share": (0.10, 0.35), "stock_days": None,
                "rent": (100, 300), "wages": (500, 1400), "utilities": (40, 100), "supplies": (0.10, 0.20), "season": (0.05, 0.20)},
    "trader": {"daily_sales": (300, 1000), "cost_share": (0.80, 0.90), "credit_share": (0.30, 0.60), "stock_days": (30, 60),
               "rent": (200, 600), "wages": (200, 700), "utilities": (40, 120), "supplies": (0, 0), "season": (0.05, 0.20)},
}
SHOCKS = ("demand_drop", "cost_rise", "late_customers", "over_borrowing", "big_equipment", "rising_drawings")


def season(month: int, amplitude: float) -> float:
    """Khmer New Year (April) and Pchum Ben (Sep/Oct) lift sales; the rainy season (Jul-Aug) slows them."""
    return 1 + amplitude * {4: 1.0, 9: 0.4, 10: 0.5, 7: -0.4, 8: -0.5, 12: 0.3}.get(month, 0.0)


@dataclass
class Business:
    id: str
    kind: str
    rng: np.random.Generator
    start: date
    months: int
    p: dict = field(default_factory=dict)
    shocks: dict[str, int] = field(default_factory=dict)  # shock -> month index it starts
    entries: list[dict] = field(default_factory=list)
    cash: float = 0.0  # cash actually in hand (the books can differ when records are imperfect)
    stock: float = 0.0
    seq: int = 0

    # ------------------------------------------------------------------ recording

    def record(self, day: date, type_id: str, direction: str, amount: float, pay: str = "cash", meta: dict | None = None,
               counterparty: str | None = None, note: str | None = None, review: bool = False) -> dict | None:
        cents = amount if isinstance(amount, int) else int(round(amount * 100))  # ints are already cents
        if cents <= 0:
            return None
        self.seq += 1
        at = int(datetime(day.year, day.month, day.day, 9 + self.seq % 10, tzinfo=BUSINESS_TZ).timestamp() * 1000)
        row = {"id": f"{self.id}-{self.seq}", "createdAt": at, "updatedAt": at, "deletedAt": None, "syncStatus": "synced",
               "title": type_id, "typeId": type_id, "direction": direction, "amount": cents, "currency": "USD",
               "exchangeRate": 4000, "payMethod": pay, "bankId": None if pay == "later" else "cash", "toBankId": None,
               "categoryId": None, "counterparty": counterparty, "note": note, "occurredAt": at, "reviewFlag": review,
               "meta": json.dumps(meta) if meta else None}
        self.entries.append(row)
        return row

    # ------------------------------------------------------------------ simulation

    def month_of(self, day: date) -> int:
        return (day.year - self.start.year) * 12 + day.month - self.start.month

    def active(self, shock: str, day: date) -> bool:
        return shock in self.shocks and self.month_of(day) >= self.shocks[shock]

    def run(self) -> list[dict]:
        r, p = self.rng, self.p
        end = add_months(self.start, self.months)
        customers = [f"Customer {i + 1}" for i in range(int(r.integers(8, 30)))]
        receivables: list[list] = []   # [due day, row id, amount left, pays?]
        payables: list[list] = []      # [due day, row id, amount left, kind]
        loans: list[dict] = []
        arrears: list[tuple[dict, float, float]] = []  # (loan, principal part, interest part)

        # Day 0: the owner puts in capital and buys the first stock.
        monthly_sales = p["daily_sales"] * 30
        capital = monthly_sales * r.uniform(0.6, 1.4) + (p["stock_days"] or 0) * p["daily_sales"] * p["cost_share"]
        self.record(self.start, "owner_capital", "in", capital)
        self.cash = capital
        if p["stock_days"]:
            self.buy_stock(self.start, p["stock_days"] * p["daily_sales"] * p["cost_share"], payables)
        if r.random() < p["loan_probability"]:
            self.take_loan(self.start + timedelta(days=int(r.integers(20, 120))), loans, p["loan_burden"])

        carried = 0.0  # cash sales not recorded yet (recorded late, with the next day's)
        duplicates: list[tuple[date, dict]] = []
        day = self.start
        while day < end:
            month = self.month_of(day)
            # Sales: base x season x shocks x noise, limited by stock on hand.
            demand = p["daily_sales"] * season(day.month, p["season"]) * float(np.exp(r.normal(0, 0.25)))
            if self.active("demand_drop", day):
                progress = min(1.0, (month - self.shocks["demand_drop"] + 1) / p["drop_months"])
                demand *= 1 - p["drop_depth"] * progress
            cost_share = p["cost_share"] + (p["cost_rise"] if self.active("cost_rise", day) else 0)
            if p["stock_days"]:
                demand = min(demand, self.stock / max(cost_share, 0.01))
            credit = demand * p["credit_share"] if r.random() < 0.6 else 0.0
            cash_sales = demand - credit
            missing_day = r.random() < p["missing_days"]
            sale_type = "service_income" if p["stock_days"] is None else "product_sale"
            for amount, pay in ((cash_sales, "cash"), (credit, "later")):
                if amount < 1:
                    continue
                meta = {} if sale_type == "service_income" else {"cost": int(round(amount * cost_share * 100))}
                if meta and r.random() < p["blank_cost"]:
                    meta = {}  # cost left blank: FINEXT estimates it
                customer = str(r.choice(customers)) if pay == "later" else None
                if pay == "later":
                    terms = int(r.choice([7, 15, 30, 30, 30, 60]))
                    meta["termsDays"] = terms
                    late = r.normal(5, 7) + (r.uniform(30, 90) if self.active("late_customers", day) else 0)
                    pays = r.random() > (0.15 if self.active("late_customers", day) else 0.01)
                    row = self.record(day, sale_type, "in", amount, "later", meta or None, customer)
                    if row:
                        receivables.append([day + timedelta(days=max(0, int(terms + late))), row["id"], amount, pays])
                elif missing_day:
                    carried += amount
                else:
                    if carried and meta:
                        meta = {"cost": meta["cost"] + int(round(carried * cost_share * 100))}
                    row = self.record(day, sale_type, "in", amount + carried, "cash", meta or None)
                    carried = 0.0
                    if row and r.random() < p["duplicates"]:
                        twin = self.record(day, sale_type, "in", row["amount"], "cash", meta or None)  # entered twice
                        if twin and r.random() < 0.7:  # usually noticed and reversed within a week
                            duplicates.append((day + timedelta(days=int(r.integers(1, 7))), twin))
                if pay == "cash":
                    self.cash += amount
            if p["stock_days"]:
                self.stock -= demand * cost_share

            for _, twin in [d for d in duplicates if d[0] == day]:
                self.reverse(day, twin)

            # Customers who owed money pay when due.
            for item in receivables:
                due, row_id, left, pays = item
                if pays and left > 0 and due <= day:
                    self.record(day, "customer_payment", "in", left, meta={"settlesId": row_id}, counterparty="Customer")
                    self.cash += left
                    item[2] = 0

            # Weekly: restock and pay supplier bills that are due, if there is cash.
            if day.weekday() == 0:
                if p["stock_days"]:
                    target = p["stock_days"] * p["daily_sales"] * season(day.month, p["season"]) * cost_share
                    self.buy_stock(day, max(0.0, target - self.stock), payables)
                for item in sorted(payables, key=lambda x: x[0]):
                    due, row_id, left, _ = item
                    if left > 0 and due <= day and self.cash >= left:
                        self.record(day, "supplier_payment", "out", left, meta={"settlesId": row_id}, counterparty="Supplier")
                        self.cash -= left
                        item[2] = 0

            # Monthly costs.
            if day.day == 1:
                self.pay_bill(day, "rent", p["rent"], "Landlord", payables)
            if day.day == 10:
                self.pay_bill(day, "utilities", p["utilities"] * float(np.exp(r.normal(0, 0.15))), "Electricity", payables)
            if day.day == 15:
                tax = 0.01 * p["daily_sales"] * 30 * season(day.month, p["season"])
                if self.cash >= tax:
                    self.record(day, "income_tax", "out", tax)
                    self.cash -= tax
            if day.day == 25:
                amount = p["transport"] * p["daily_sales"] * 30 * season(day.month, p["season"]) * float(np.exp(r.normal(0, 0.2)))
                self.pay_bill(day, "transport", amount, "Transport", payables)
            if day.day == 20 and p["supplies"]:
                amount = p["supplies"] * p["daily_sales"] * 30
                self.pay_bill(day, "other_cost", amount, "Supplies shop", payables, note="Supplies")
            if (day + timedelta(days=1)).day == 1:  # last day of the month
                self.pay_bill(day, "wages", p["wages"], "Staff", payables)
                drawings = p["drawings"] * (r.uniform(2, 3) if self.active("rising_drawings", day) else 1)
                drawings = min(drawings, max(0.0, self.cash - p["rent"]))
                if drawings > 1:
                    self.record(day, "owner_drawings", "out", drawings)
                    self.cash -= drawings

            # Shocks that happen once.
            if self.shocks.get("over_borrowing") == month and day.day == 5:
                self.take_loan(day, loans, p["over_borrow_burden"])
            if self.shocks.get("big_equipment") == month and day.day == 8:
                amount = p["daily_sales"] * 30 * r.uniform(0.8, 2.0)
                self.record(day, "equipment_purchase", "out", amount, meta={"assetName": "Equipment", "usefulLifeYears": int(r.integers(3, 8))})
                self.cash -= amount

            # Loan instalments: pay what is due (arrears first), when there is cash.
            for loan in loans:
                while loan["next"] < len(loan["schedule"]) and loan["schedule"][loan["next"]][0].date() <= day:
                    arrears.append((loan, *self.split_instalment(loan)))
                    loan["next"] += 1
            still = []
            for loan, principal, interest in arrears:  # cents
                if self.cash * 100 >= principal + interest:
                    self.record(day, "loan_repayment", "out", principal + interest,
                                meta={"loanName": loan["lender"], "interest": interest})
                    self.cash -= (principal + interest) / 100
                else:
                    still.append((loan, principal, interest))
            arrears = still
            day += timedelta(days=1)
        return self.entries

    def reverse(self, day: date, original: dict) -> None:
        """A reversing entry (rules §6) carrying a copy of the original, as the app sends it."""
        keys = ("typeId", "direction", "amount", "currency", "payMethod", "bankId", "toBankId", "counterparty", "note")
        copy = {k: original[k] for k in keys}
        copy["meta"] = json.loads(original["meta"]) if original["meta"] else None
        opposite = {"in": "out", "out": "in"}[original["direction"]]
        self.record(day, "reversal", opposite, original["amount"], original["payMethod"],
                    {"reversesId": original["id"], "reverses": copy})

    def buy_stock(self, day: date, amount: float, payables: list) -> None:
        if amount < 5:
            return
        on_credit = amount * self.p["supplier_credit"]
        paid_now = min(amount - on_credit, max(0.0, self.cash - self.p["rent"]))  # keep rent money back
        if paid_now > 1:
            self.record(day, "stock_materials", "out", paid_now)
            self.cash -= paid_now
        if on_credit > 1:
            row = self.record(day, "stock_materials", "out", on_credit, "later", {"termsDays": 30}, "Supplier")
            if row:
                payables.append([day + timedelta(days=30), row["id"], on_credit, "stock"])
        self.stock += paid_now + on_credit

    def pay_bill(self, day: date, type_id: str, amount: float, party: str, payables: list, note: str | None = None) -> None:
        if amount < 1:
            return
        if self.cash >= amount:
            self.record(day, type_id, "out", amount, note=note)
            self.cash -= amount
        else:  # cannot pay: recorded as unpaid and settled later, when cash allows
            row = self.record(day, type_id, "out", amount, "later", {"termsDays": 7}, party, note=note)
            if row:
                payables.append([day + timedelta(days=7), row["id"], amount, "bill"])

    def take_loan(self, day: date, loans: list, burden: float) -> None:
        """Size the loan so the instalment is `burden` x the business's usual monthly profit."""
        r, p = self.rng, self.p
        term = int(r.choice([6, 12, 12, 18, 24, 36]))
        rate = float(r.uniform(12, 28))
        rate_type = "flat" if r.random() < 0.6 else "declining"
        instalment = max(50.0, burden * p["monthly_profit"])
        per_unit = loan_schedule.estimated_instalment(10_000, rate, rate_type, term, "monthly") / 10_000
        principal = instalment / per_unit
        lender = f"{self.id} lender {len(loans) + 1}"
        first_due = day + timedelta(days=30)
        meta = {"lender": lender, "lenderType": "bank_mfi", "termMonths": term, "annualInterestRate": round(rate, 2),
                "rateType": rate_type, "repaymentFrequency": "monthly",
                "firstDueDate": int(datetime(first_due.year, first_due.month, first_due.day, 12, tzinfo=BUSINESS_TZ).timestamp() * 1000)}
        row = self.record(day, "loan_received", "in", principal, meta=meta, counterparty=lender)
        self.cash += principal
        schedule, _ = loan_schedule.schedule(row, meta)
        loans.append({"lender": lender, "schedule": schedule, "next": 0, "principal_left": row["amount"], "rate": rate,
                      "rate_type": rate_type, "term": term, "principal": row["amount"]})
        if r.random() < 0.5:  # many loans fund equipment or stock rather than sitting in cash
            spend = principal * r.uniform(0.4, 0.9)
            self.record(day + timedelta(days=3), "equipment_purchase", "out", spend,
                        meta={"assetName": "Equipment", "usefulLifeYears": int(r.integers(3, 8))})
            self.cash -= spend

    @staticmethod
    def split_instalment(loan: dict) -> tuple[int, int]:
        """Principal and interest parts of the next instalment, in cents (the last one clears what is left)."""
        instalment = loan["schedule"][loan["next"]][1]
        if loan["rate_type"] == "flat":
            interest = round(loan["principal"] * loan["rate"] / 100 * loan["term"] / 12 / len(loan["schedule"]))
        else:
            interest = round(loan["principal_left"] * loan["rate"] / 100 / 12)
        principal = min(loan["principal_left"], max(0, instalment - interest))
        if loan["next"] == len(loan["schedule"]) - 1:
            principal = loan["principal_left"]
        loan["principal_left"] -= principal
        return principal, interest


def add_months(day: date, months: int) -> date:
    index = day.year * 12 + day.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def make_business(index: int, rng: np.random.Generator, months: int) -> Business:
    kind = str(rng.choice(list(ARCHETYPES), p=[0.35, 0.2, 0.25, 0.2]))
    a = ARCHETYPES[kind]
    draw = lambda key: float(rng.uniform(*a[key]))  # noqa: E731
    p = {key: draw(key) for key in ("daily_sales", "cost_share", "credit_share", "rent", "wages", "utilities", "supplies", "season")}
    p["stock_days"] = float(rng.uniform(*a["stock_days"])) if a["stock_days"] else None
    p["transport"] = float(rng.uniform(0.02, 0.05))  # transport and delivery, a share of sales
    gross = p["daily_sales"] * 30 * (1 - p["cost_share"] - p["supplies"] - p["transport"])
    p["monthly_profit"] = max(100.0, gross - p["rent"] - p["wages"] - p["utilities"] - 0.01 * p["daily_sales"] * 30)
    p.update(
        # Owners live off the business and lean on supplier credit and loans, as most MSMEs do.
        drawings=p["monthly_profit"] * float(rng.uniform(0.5, 1.0)), supplier_credit=float(rng.uniform(0.1, 0.7)),
        loan_probability=0.65, loan_burden=float(rng.uniform(0.2, 0.7)), over_borrow_burden=float(rng.uniform(0.9, 1.8)),
        drop_depth=float(rng.uniform(0.3, 0.65)), drop_months=int(rng.integers(2, 8)), cost_rise=float(rng.uniform(0.05, 0.12)),
        missing_days=float(rng.uniform(0, 0.08)), duplicates=float(rng.uniform(0, 0.02)), blank_cost=float(rng.uniform(0, 0.3)),
    )
    count = int(rng.choice([0, 0, 0, 1, 1, 1, 2]))  # most businesses have no problem; some have one or two
    shocks = {str(s): int(rng.integers(4, months - 2)) for s in rng.choice(SHOCKS, size=count, replace=False)}
    start = date(2023, int(rng.integers(1, 7)), 1)
    return Business(f"B{index:04d}", kind, rng, start, months, p, shocks)


def stress_3m(features: list[dict | None], t: int) -> int | None:
    """Spec C3 stress_3m, from months t+1..t+3 only (never the months used for the inputs):
    cash runway below two weeks in any of them, OCF negative in all three, or DSCR <= 1.0 over those three months."""
    future = features[t + 1:t + 4]
    if len(future) < 3 or any(f is None for f in future):
        return None
    runway = any(f["cash_runway"] is not None and f["cash_runway"] < 0.5 for f in future)
    ocf = all(f["ocf"] < 0 for f in future)
    dscr = future[2]["dscr"] is not None and future[2]["dscr"] <= 1.0  # its rolling window is exactly t+1..t+3
    return int(runway or ocf or dscr)


def simulate(n: int = 400, months: int = 36, seed: int = 20261027) -> list[dict]:
    """One row per business-month snapshot: identifiers, Stage A features, Layer 1 counts and the label."""
    rows = []
    root = np.random.default_rng(seed)
    for i in range(n):
        business = make_business(i, np.random.default_rng(root.integers(2**32)), months)
        entries = business.run()
        end = add_months(business.start, months)
        snaps = monthly_snapshots(entries, [CASH], SETTINGS, through=datetime(end.year, end.month, 1, tzinfo=BUSINESS_TZ))
        features = [s["features"] for s in snaps]
        for t, snap in enumerate(snaps):
            if snap["features"] is None:
                continue
            row = {"business": business.id, "kind": business.kind, "period": snap["period"], "t": t,
                   "shocks": ",".join(sorted(business.shocks)), **snap["features"],
                   **{f"l1_{dim}_{level}": count for dim, levels in snap["dimensions"].items() for level, count in levels.items()},
                   "l1_red_total": sum(v == "red" for v in snap["ratioStatus"].values()),
                   "l1_yellow_total": sum(v == "yellow" for v in snap["ratioStatus"].values()),
                   "stress_3m": stress_3m(features, t)}
            row.update({f"reason_{k}": v for k, v in snap["reasons"].items()})
            rows.append(row)
    return rows

