"""The future-risk AI must respond sensibly to realistic MSME books (profiles in tests/risk_scenarios.py)."""
import re
from functools import lru_cache
from pathlib import Path

import pytest

from app.snapshots import monthly_snapshots
from tests.risk_scenarios import PROFILES, THROUGH, WORSE_THAN_HEALTHY, assess, build
from tests.test_worked_sample import CASH

BY_NAME = {p.name: p for p in PROFILES}
APP_STRINGS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n" / "en.ts"


@lru_cache(maxsize=None)
def result(name: str) -> dict:
    return assess(BY_NAME[name])


def probability(name: str) -> float:
    return result(name)["model"]["probability"]


@pytest.mark.parametrize("profile", PROFILES, ids=lambda p: p.name)
def test_profiles_are_realistic_books(profile):
    # Cash never below zero at a month end: otherwise the profile, not the AI, is wrong.
    snaps = monthly_snapshots(build(profile), [CASH], through=THROUGH)
    assert min(s["features"]["cash"] for s in snaps if s["features"]) >= 0


def test_healthy_businesses_are_low_risk_whatever_their_size():
    healthy = [name for name in BY_NAME if name.startswith("Healthy") or name.startswith("Growing") or name.startswith("Service")]
    for name in healthy:
        assert result(name)["model"]["riskClass"] == "low", name
        assert result(name)["debtCapacity"]["level"] == "low", name
    # Same ratios at 10x smaller and 10x larger: same answer (amounts never enter the model).
    sizes = [probability(n) for n in ("Healthy grocery", "Healthy grocery, small stall (10x smaller)", "Healthy grocery, large trader (10x larger)")]
    assert max(sizes) - min(sizes) < 0.001


@pytest.mark.parametrize("name", WORSE_THAN_HEALTHY)
def test_worse_books_never_score_below_the_healthy_grocery(name):
    assert probability(name) > probability("Healthy grocery"), name


@pytest.mark.parametrize("name", ["Loss-making every month", "Sales falling 5% a month"])
def test_losses_are_at_least_moderate(name):
    assert result(name)["model"]["riskClass"] in {"moderate", "high"}
    driver = result(name)["model"]["topDrivers"][0]
    assert driver["direction"] == "raises risk" and driver["reason"] == "no_interest_loss"  # the loss, said plainly


def test_liabilities_above_assets_is_high_risk():
    assert result("Liabilities exceed assets (losses funded by unpaid suppliers)")["model"]["riskClass"] == "high"


@pytest.mark.parametrize("name, code", [
    ("Heavily indebted (instalments > profit)", "dscr_below_one"),
    ("Loan instalments not being paid", "instalments_missed"),
])
def test_debt_problems_are_over_stretched_with_the_reason(name, code):
    capacity = result(name)["debtCapacity"]
    assert capacity["level"] == "high" and code in [r["code"] for r in capacity["reasons"]]


@pytest.mark.parametrize("name, code", [
    ("Customers not paying (60% on credit, half collected)", "customers_overdue"),
    ("Behind with suppliers (bills on credit, 40% paid)", "suppliers_overdue"),
])
def test_late_customers_and_suppliers_are_named(name, code):
    assert code in [r["code"] for r in result(name)["debtCapacity"]["reasons"]]


def test_more_unpaid_customer_days_raise_risk():
    drivers = {d["feature"]: d for d in result("Customers not paying (60% on credit, half collected)")["model"]["topDrivers"]}
    if "receivable_days" in drivers:
        assert drivers["receivable_days"]["direction"] == "raises risk"


def test_short_histories_are_scored_with_low_confidence():
    six = result("New business, 6 months of records")["model"]
    assert six["available"] and six["confidence"] == "low"
    reasons = {d["feature"]: d["reason"] for d in six["topDrivers"]}
    assert reasons.get("sales_growth") in (None, "not_yet_available")


@pytest.mark.skipif(not APP_STRINGS.exists(), reason="frontend not checked out")
def test_every_reason_the_backend_gives_has_app_text():
    keys = set(re.findall(r"^\s*'([^']+)':", APP_STRINGS.read_text(encoding="utf-8"), flags=re.M))
    from app import risk, risk_features
    gap_codes = set(risk_features.MISSING_TEXT)
    reason_codes = set(re.findall(r'_reason\("([a-z_]+)"', Path(risk.__file__).read_text(encoding="utf-8")))
    assert reason_codes, "no reason codes found"
    assert {f"risk.gap.{c}" for c in gap_codes} <= keys, {c for c in gap_codes if f"risk.gap.{c}" not in keys}
    assert {f"debt.reason.{c}" for c in reason_codes} <= keys, {c for c in reason_codes if f"debt.reason.{c}" not in keys}
