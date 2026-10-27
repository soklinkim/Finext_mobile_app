"""Behaviour test for the future-risk AI: realistic MSME books, written as ordinary FINEXT entries, run through the
real pipeline (snapshots -> ratios -> model -> reasons, and the debt capacity check).

These are hand-written test cases for checking that the AI responds sensibly (worse books, higher risk), like the
worked sample in test_worked_sample.py. They are not training data: the model never sees them.

    python -m tests.risk_scenarios            # prints the report (from backend/)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app import risk
from app.business_time import BUSINESS_TZ
from tests.test_settlement import entry, payment
from tests.test_worked_sample import CASH, on

THROUGH = datetime(2026, 1, 1, tzinfo=BUSINESS_TZ)
END_YEAR, END_MONTH = 2025, 12  # last complete month


def cents(dollars: float) -> int:
    return round(dollars * 100)


@dataclass
class Loan:
    amount: float
    start: int                 # month index the loan is received (0 = first month)
    term: int = 24
    rate: float = 18.0         # % a year, flat
    paid: bool = True          # instalments actually paid each month


@dataclass
class Profile:
    """Monthly figures in USD. `sales(i)` may vary by month index i (0 = first of `months`)."""
    name: str
    months: int = 24
    sales: float = 10_000
    sales_change: float = 0.0          # % change a month (compounding)
    collapse_last: int = 0             # last N months sell a quarter of normal
    cogs_share: float = 0.70           # cost of goods as a share of product sales; 0 = service business
    credit_share: float = 0.10         # share of sales on credit
    collected: float = 1.0             # share of credit sales customers pay next month
    supplier_credit: float = 0.0       # share of stock bought on credit
    supplier_paid: float = 1.0         # share of supplier bills paid next month
    rent: float = 600
    wages: float = 800
    other_costs: float = 300
    drawings: float = 600
    tax_share: float = 0.01            # income tax as a share of sales
    capital: float = 15_000
    loans: list[Loan] = field(default_factory=list)
    equipment: float = 0.0             # bought in the first month, 5-year life

    def month(self, i: int) -> tuple[int, int]:
        index = END_YEAR * 12 + END_MONTH - 1 - (self.months - 1) + i
        return index // 12, index % 12 + 1


def build(p: Profile) -> list[dict]:
    first_year, first_month = p.month(0)
    before = (first_year - 1, 12) if first_month == 1 else (first_year, first_month - 1)
    rows = [entry("capital", "owner_capital", "in", cents(p.capital), at=on(*before, 20))]
    if p.cogs_share:  # opening stock: one month of cost of goods
        rows.append(entry("stock-0", "stock_materials", "out", cents(p.sales * p.cogs_share), at=on(*before, 22)))
    if p.equipment:
        rows.append(entry("equipment", "equipment_purchase", "out", cents(p.equipment),
                          meta={"assetName": "Equipment", "usefulLifeYears": 5}, at=on(*before, 25)))
    for n, loan in enumerate(p.loans):
        y, m = p.month(loan.start) if loan.start >= 0 else before
        first_due = p.month(loan.start + 1) if loan.start + 1 < p.months else (y + (m == 12), m % 12 + 1)
        rows.append(entry(f"loan-{n}", "loan_received", "in", cents(loan.amount), at=on(y, m, 2), counterparty=f"Bank {n}", meta={
            "lender": f"Bank {n}", "lenderType": "bank_mfi", "termMonths": loan.term, "annualInterestRate": loan.rate,
            "rateType": "flat", "repaymentFrequency": "monthly", "firstDueDate": on(*first_due, 2)}))

    open_credit: list[tuple[str, int]] = []
    open_bills: list[tuple[str, int]] = []
    level = p.sales
    for i in range(p.months):
        y, m = p.month(i)
        if i:
            level *= 1 + p.sales_change / 100
        sales = level / 4 if p.collapse_last and i >= p.months - p.collapse_last else level
        # Last month's credit sales and supplier bills are settled (or not) at the start of the month.
        for sid, amount in open_credit:
            if p.collected:
                rows.append(payment(f"pay-{sid}", sid, round(amount * p.collected)) | {"occurredAt": on(y, m, 3)})
        for bid, amount in open_bills:
            if p.supplier_paid:
                rows.append(payment(f"pay-{bid}", bid, round(amount * p.supplier_paid), "supplier_payment", "out") | {"occurredAt": on(y, m, 4)})
        open_credit, open_bills = [], []

        kind = "product_sale" if p.cogs_share else "service_income"
        cash_part, credit_part = sales * (1 - p.credit_share), sales * p.credit_share
        cost = lambda amount: {"cost": cents(amount * p.cogs_share)} if p.cogs_share else None  # noqa: E731
        rows.append(entry(f"sale-{i}", kind, "in", cents(cash_part), meta=cost(cash_part), at=on(y, m, 10)))
        if credit_part:
            meta = {**(cost(credit_part) or {}), "termsDays": 30}
            rows.append(entry(f"credit-{i}", kind, "in", cents(credit_part), pay="later", meta=meta, at=on(y, m, 12)))
            open_credit.append((f"credit-{i}", cents(credit_part)))
        if p.cogs_share:  # restock what was sold
            restock = sales * p.cogs_share
            if restock * (1 - p.supplier_credit):
                rows.append(entry(f"stock-{i+1}", "stock_materials", "out", cents(restock * (1 - p.supplier_credit)), at=on(y, m, 14)))
            if p.supplier_credit:
                rows.append(entry(f"bill-{i}", "stock_materials", "out", cents(restock * p.supplier_credit), pay="later",
                                  meta={"termsDays": 30}, at=on(y, m, 14)))
                open_bills.append((f"bill-{i}", cents(restock * p.supplier_credit)))
        for kind_, amount, day in (("rent", p.rent, 5), ("wages", p.wages, 25), ("other_cost", p.other_costs, 18),
                                   ("income_tax", sales * p.tax_share, 20), ("owner_drawings", p.drawings, 28)):
            if amount:
                rows.append(entry(f"{kind_}-{i}", kind_, "out", cents(amount), at=on(y, m, day)))
        for n, loan in enumerate(p.loans):
            if loan.paid and loan.start < i <= loan.start + loan.term:
                interest = loan.amount * loan.rate / 100 / 12
                rows.append(entry(f"repay-{n}-{i}", "loan_repayment", "out", cents(loan.amount / loan.term + interest),
                                  meta={"loanName": f"Bank {n}", "interest": cents(interest)}, at=on(y, m, 2)))
    return rows


def debt_free(name: str, **kw) -> Profile:
    return Profile(name, **kw)


PROFILES: list[Profile] = [
    # Healthy grocery: $10,000 sales a month, 30% gross margin, $1,300 operating profit, $600 left after tax and drawings.
    Profile("Healthy grocery"),
    Profile("Healthy grocery, small stall (10x smaller)", sales=1_000, rent=60, wages=80, other_costs=30, drawings=60, capital=1_500),
    Profile("Healthy grocery, large trader (10x larger)", sales=100_000, rent=6_000, wages=8_000, other_costs=3_000, drawings=6_000, capital=150_000),
    Profile("Healthy grocery with a loan it can repay", loans=[Loan(6_000, start=12)]),
    Profile("Growing fast (+4% a month)", sales_change=4),
    Profile("Service business (no stock)", cogs_share=0, sales=4_000, wages=1_200, rent=500, other_costs=200, drawings=800),
    Profile("Thin margin (cost of goods 80%)", cogs_share=0.80, capital=25_000),
    Profile("Loss-making every month", cogs_share=0.85, rent=900, wages=1_000, other_costs=400, capital=50_000),
    Profile("Sales falling 5% a month", sales_change=-5, capital=30_000),
    Profile("Sales collapsed in the last 3 months", collapse_last=3),
    Profile("Owner draws more than the profit", drawings=2_500, capital=40_000),
    Profile("Heavily indebted (instalments > profit)", loans=[Loan(40_000, start=16, term=24, rate=20)], capital=10_000),
    Profile("Loan instalments not being paid", loans=[Loan(20_000, start=6, term=24, rate=18, paid=False)]),
    Profile("Customers not paying (60% on credit, half collected)", credit_share=0.6, collected=0.5, capital=70_000),
    Profile("Behind with suppliers (bills on credit, 40% paid)", supplier_credit=0.8, supplier_paid=0.4),
    Profile("Liabilities exceed assets (losses funded by unpaid suppliers)", cogs_share=0.86, rent=900, wages=1_000,
            drawings=0, capital=9_000, supplier_credit=0.8, supplier_paid=0.5),
    Profile("New business, 6 months of records", months=6),
    Profile("New business, 12 months of records", months=12),
]

# Worse books must never score lower than the healthy grocery (the model's probability).
# Known limitation, not in this list: "Customers not paying" scores about the same as the healthy grocery. Its high
# receivable days do raise the risk (checked in test_risk_behaviour), but the model weighs them lightly, and the healthy
# shop loses a little for its high sales-to-assets (4x; the Polish factories it learned from sit near 1x, and there very
# high turnover often came before failure). Forcing "higher turnover = lower risk" cost accuracy on unseen companies
# (CV PR-AUC 0.635 -> 0.616), so the debt capacity check names late customers instead ("customers_overdue").
WORSE_THAN_HEALTHY = [
    "Thin margin (cost of goods 80%)", "Loss-making every month", "Heavily indebted (instalments > profit)",
    "Loan instalments not being paid", "Behind with suppliers (bills on credit, 40% paid)",
    "Liabilities exceed assets (losses funded by unpaid suppliers)", "Sales falling 5% a month",
]


def assess(p: Profile, proposed: dict | None = None) -> dict:
    return risk.assess(build(p), [CASH], proposed=proposed, through=THROUGH)


def report() -> str:
    lines = ["| Business | AI risk (12 months) | Level | Debt capacity | Top reasons |", "|---|---:|---|---|---|"]
    for p in PROFILES:
        out = assess(p)
        model, cap = out["model"], out["debtCapacity"]
        risk_text = f"{model['probability']:.1%}" if model["available"] else "—"
        level = model["riskClass"] if model["available"] else "not enough history"
        reasons = "; ".join(f"{d['label']} = {d['value_text']} ({d['direction']})" for d in model["topDrivers"][:3]) if model["available"] else ""
        capacity = cap["level"] if cap["available"] else "—"
        if cap["available"] and cap["reasons"]:
            capacity += " (" + ", ".join(r["code"] for r in cap["reasons"]) + ")"
        lines.append(f"| {p.name} | {risk_text} | {level} | {capacity} | {reasons} |")
    return "\n".join(lines)


if __name__ == "__main__":
    print(report())
