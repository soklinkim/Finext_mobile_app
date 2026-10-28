"""The lender validation script must give the model exactly what the app gives it from the same books."""
import csv
import importlib.util
from pathlib import Path

import pytest

from app.risk import model_inputs
from app.risk_features import FEATURES, risk_features
from app.snapshots import monthly_snapshots
from tests.test_risk import THROUGH, shop
from tests.test_worked_sample import CASH

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "validate_lender_data.py"
spec = importlib.util.spec_from_file_location("validate_lender_data", SCRIPT)
validate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validate)


def figures_from_books(snapshots):
    """The template's columns, read off the app's own monthly books (last 12 months, balances at the end)."""
    recent, earlier, b = snapshots[-12:], snapshots[-24:-12], snapshots[-1]["features"]
    total = lambda name, months=recent: sum(s["features"][name] for s in months)  # noqa: E731
    return {"bad_within_12m": 0, "sales": total("revenue"), "cost_of_goods_sold": total("cogs"), "operating_profit": total("ebit"),
            "net_profit": total("net_profit"), "total_assets": b["total_assets"], "current_assets": b["current_assets"],
            "receivables": b["receivables"], "inventory": b["inventory"], "current_liabilities": b["current_liabilities"],
            "total_liabilities": b["total_liabilities"], "equity": b["equity"], "retained_earnings": b["equity"] - b["owner_capital"],
            "sales_prior_year": total("revenue", earlier), "operating_expenses": total("operating_expenses"),
            "depreciation": total("depreciation"), "interest_paid": total("interest"), "income_tax": total("tax"), "cash": b["cash"]}


@pytest.mark.parametrize("slump_from", [None, 18])
def test_template_figures_give_the_same_model_inputs_as_the_app(slump_from):
    snapshots = monthly_snapshots(shop(months=24, slump_from=slump_from), [CASH], {}, None, THROUGH.replace(year=2027))
    ranges = validate.default_model().meta["range"]
    app_inputs = risk_features(snapshots)
    expected, _, _ = model_inputs(app_inputs, ranges)
    got = validate.model_row(figures_from_books(snapshots), ranges)
    assert set(got) == set(FEATURES)
    for name in FEATURES:
        assert got[name] == pytest.approx(expected[name], rel=1e-9, abs=1e-12), name


def test_a_blank_figure_leaves_its_ratios_missing_instead_of_guessing():
    snapshots = monthly_snapshots(shop(months=24), [CASH], {}, None, THROUGH.replace(year=2027))
    loan = figures_from_books(snapshots) | {"interest_paid": None, "cash": None}
    got = validate.model_row(loan, validate.default_model().meta["range"])
    assert got["interest_coverage"] is None and got["costs_to_sales"] is None and got["liquid_days_of_expenses"] is None
    assert got["net_margin"] is not None


def test_ranking_score():
    import numpy as np
    assert validate.roc_auc(np.array([0, 0, 1, 1]), np.array([0.1, 0.2, 0.8, 0.9])) == 1.0
    assert validate.roc_auc(np.array([0, 1]), np.array([0.5, 0.5])) == 0.5


def test_too_few_bad_loans_writes_no_report(tmp_path):
    path = tmp_path / "loans.csv"
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=validate.REQUIRED + validate.OPTIONAL)
        writer.writeheader()
        for i in range(40):
            writer.writerow({c: "" for c in validate.OPTIONAL} | {c: 100 + i for c in validate.REQUIRED} | {"bad_within_12m": int(i < 5)})
    assert validate.main([str(path)]) == 1
    assert not list(tmp_path.glob("*_report.md"))
