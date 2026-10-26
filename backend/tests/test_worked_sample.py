"""FINEXT_FINANCE_RULES.md §8.4: the engine must reproduce the Sample Grocery Shop statements exactly (§11 invariant 7).

The rules give only the totals, so this builds a ledger of ordinary entries (2023 set-up, then the prior
year 2024 and the current year 2025) whose statements must come out at exactly those totals.
"""
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app import bookkeeping
from app.auth import current_user
from app.business_time import BUSINESS_TZ
from app.main import app
from app.routers import accounting as accounting_router
from app.routers import sync as sync_router
from tests.test_settlement import entry, payment
from tests.test_sync import FakeDB

CASH = {"id": "cash", "createdAt": 1, "updatedAt": 1, "deletedAt": None, "syncStatus": "pending",
        "name": "Cash", "kind": "cash", "logoKey": None}


def usd(dollars: float) -> int:
    return round(dollars * 100)


def on(year: int, month: int, day: int) -> int:
    return int(datetime(year, month, day, 12, tzinfo=BUSINESS_TZ).timestamp() * 1000)


def ledger() -> list[dict]:
    aba = {"lender": "ABA Bank", "lenderType": "bank_mfi", "termMonths": 12}
    acleda = {"lender": "ACLEDA", "lenderType": "bank_mfi", "termMonths": 36}
    return [
        # 2023 set-up: retained earnings brought forward into 2024 = 1,700.
        entry("capital-23", "owner_capital", "in", usd(10_000), at=on(2023, 3, 1)),
        entry("loan-aba", "loan_received", "in", usd(5_000), meta=aba, at=on(2023, 3, 1)),        # 2400
        entry("loan-acleda", "loan_received", "in", usd(6_000), meta=acleda, at=on(2023, 3, 1)),  # 2600
        # Depreciation starts the month after purchase: 125 a month from September 2023, so 500 in 2023, then 1,500 a year.
        entry("shop-fit", "equipment_purchase", "out", usd(15_000), meta={"assetName": "Shop fit-out", "usefulLifeYears": 10}, at=on(2023, 8, 20)),
        entry("stock-23", "stock_materials", "out", usd(2_800), at=on(2023, 6, 1)),
        entry("sale-23", "product_sale", "in", usd(5_000), meta={"cost": usd(2_800)}, at=on(2023, 7, 1)),

        # 2024 (prior year).
        entry("sale-24", "product_sale", "in", usd(59_000), meta={"cost": usd(39_000)}, at=on(2024, 6, 15)),
        entry("credit-sale-24", "product_sale", "in", usd(3_000), pay="later", meta={"cost": usd(2_000)}, at=on(2024, 11, 20)),
        entry("stock-24", "stock_materials", "out", usd(46_100), at=on(2024, 5, 1)),
        entry("stock-bill-24", "stock_materials", "out", usd(4_000), pay="later", at=on(2024, 12, 1)),
        entry("deposit-24", "customer_deposit", "in", usd(1_200), at=on(2024, 12, 10)),
        entry("rent-24", "rent", "out", usd(6_000), at=on(2024, 6, 1)),
        entry("wages-24", "wages", "out", usd(8_800), at=on(2024, 6, 1)),
        entry("interest-24", "loan_repayment", "out", usd(700), meta={"loanName": "ACLEDA", "interest": usd(700)}, at=on(2024, 12, 15)),
        entry("tax-24", "income_tax", "out", usd(200), at=on(2024, 12, 20)),
        entry("drawings-24", "owner_drawings", "out", usd(2_400), at=on(2024, 8, 1)),

        # 2025 (current year).
        payment("collect-24", "credit-sale-24", usd(3_000)) | {"occurredAt": on(2025, 1, 10)},
        payment("pay-bill-24", "stock-bill-24", usd(4_000), "supplier_payment", "out") | {"occurredAt": on(2025, 1, 15)},
        entry("sale-25", "product_sale", "in", usd(67_100), meta={"cost": usd(43_400)}, at=on(2025, 6, 15)),
        entry("credit-sale-25", "product_sale", "in", usd(3_900), pay="later", meta={"cost": usd(2_600)}, at=on(2025, 12, 5)),
        entry("stock-25", "stock_materials", "out", usd(42_500), at=on(2025, 5, 1)),
        entry("stock-bill-25", "stock_materials", "out", usd(5_000), pay="later", at=on(2025, 12, 1)),
        entry("grant-25", "other_income", "in", usd(300), at=on(2025, 9, 1)),
        entry("rent-25", "rent", "out", usd(6_600), at=on(2025, 6, 1)),
        entry("wages-25", "wages", "out", usd(9_300), at=on(2025, 6, 1)),
        entry("repay-aba-25", "loan_repayment", "out", usd(1_300), meta={"loanName": "ABA Bank", "interest": usd(300)}, at=on(2025, 10, 1)),
        entry("repay-acleda-25", "loan_repayment", "out", usd(1_500), meta={"loanName": "ACLEDA", "interest": usd(500)}, at=on(2025, 10, 1)),
        entry("tax-25", "income_tax", "out", usd(350), at=on(2025, 12, 20)),
        entry("capital-25", "owner_capital", "in", usd(2_000), at=on(2025, 2, 1)),
        entry("drawings-25", "owner_drawings", "out", usd(3_000), at=on(2025, 8, 1)),
        # 3,100 of equipment in November: December depreciation 92.71 + 7.29 = 100, so 1,600 for the year.
        entry("scales", "equipment_purchase", "out", usd(2_225), meta={"assetName": "Scales", "usefulLifeYears": 2}, at=on(2025, 11, 15)),
        entry("shelving", "equipment_purchase", "out", usd(875), meta={"assetName": "Shelving", "usefulLifeYears": 10}, at=on(2025, 11, 15)),
    ]


def frozen_at(moment: datetime):
    class Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return moment if tz is None else moment.astimezone(tz)
    return Frozen


def statements_at(monkeypatch, year: int, rows: list[dict]) -> dict:
    """Annual statements as at the last moment of `year`, from a fresh store holding `rows`."""
    fake = FakeDB()
    monkeypatch.setattr(sync_router, "db", fake)
    monkeypatch.setattr(accounting_router, "db", fake)
    clock = frozen_at(datetime(year, 12, 31, 23, 59, 59, 500_000, tzinfo=BUSINESS_TZ))
    monkeypatch.setattr(accounting_router, "datetime", clock)
    monkeypatch.setattr(bookkeeping, "datetime", clock)
    app.dependency_overrides[current_user] = lambda: "grocery"
    client = TestClient(app)
    try:
        pushed = client.post("/sync/push", json={"batches": [
            {"table": "banks", "rows": [CASH]}, {"table": "transactions", "rows": rows}]}).json()
        assert pushed["rejected"] == []
        response = client.get("/accounting/statements?period=annual")
        assert response.status_code == 200, response.text
        return response.json()
    finally:
        app.dependency_overrides.clear()


def figures(statement: dict, column: str = "current") -> dict[str, int]:
    return {line["key"]: line[column] for section in statement["sections"] for line in section["lines"] if column in line}


def ratios(statement: dict, column: str = "current") -> dict[str, float]:
    return {ratio["label"]: round(ratio[column], 4) for ratio in statement["quickRatios"]}


@pytest.fixture
def current_year(monkeypatch):
    return statements_at(monkeypatch, 2025, ledger())


@pytest.fixture
def prior_year(monkeypatch):
    return statements_at(monkeypatch, 2024, [row for row in ledger() if row["occurredAt"] < on(2025, 1, 1)])


def test_income_statement_matches_the_sample(current_year):
    cur, prior = figures(current_year["income"]), figures(current_year["income"], "prior")
    expected = {"sales": (71_000, 62_000), "cogs": (-46_000, -41_000), "gross": (25_000, 21_000),
                "depreciation": (-1_600, -1_500), "operating": (-17_500, -16_300), "operatingProfit": (7_500, 4_700),
                "otherIncome": (300, 0), "interest": (-800, -700), "tax": (-350, -200), "net": (6_650, 3_800)}
    for key, (now, before) in expected.items():
        assert (cur[key], prior[key]) == (usd(now), usd(before)), key
    assert ratios(current_year["income"]) == {"Gross margin": 0.3521, "Net margin": 0.0937}
    assert ratios(current_year["income"], "prior") == {"Gross margin": 0.3387, "Net margin": 0.0613}


def test_balance_sheet_matches_the_sample(current_year, prior_year):
    for report, expected in (
        (current_year, {"currentAssets": 19_450, "assets": 33_950, "liabilities": 15_200, "capital": 12_000,
                        "retained": 3_100, "drawings": -3_000, "equity": 18_750}),
        (prior_year, {"currentAssets": 16_300, "assets": 29_300, "liabilities": 16_200, "capital": 10_000,
                      "retained": 1_700, "drawings": -2_400, "equity": 13_100}),
    ):
        lines = figures(report["balance"])
        for key, value in expected.items():
            assert lines[key] == usd(value), key
        current_liabilities = sum(lines[key] for key in ("payables", "deposits", "accrued", "shortLoans", "otherBorrowings"))
        assert current_liabilities == usd(10_200)
        assert report["balance"]["check"]["difference"] == 0
    assert round(current_year["balance"]["quickRatios"][0]["current"], 2) == 1.91
    assert round(current_year["balance"]["quickRatios"][1]["current"], 2) == 0.81  # Liabilities-to-equity (§12 Q6)
    assert round(prior_year["balance"]["quickRatios"][0]["current"], 2) == 1.60
    assert round(prior_year["balance"]["quickRatios"][1]["current"], 2) == 1.24


def test_annual_comparison_uses_the_same_calendar_date_after_a_leap_year(current_year):
    """31 Dec 2025 compares with all of 2024, including 31 December (2024 had 366 days)."""
    assert figures(current_year["income"], "prior")["depreciation"] == usd(-1_500)


def test_cash_flow_matches_the_sample(current_year):
    lines = figures(current_year["cashflow"])
    assert (lines["operatingCash"], lines["investingCash"], lines["financingCash"]) == (usd(6_850), usd(-3_100), usd(-3_000))
    assert (lines["openingCash"], lines["closingCash"]) == (usd(4_200), usd(4_950))
    assert current_year["cashflow"]["check"]["difference"] == 0
