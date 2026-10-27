import pytest

from finext_ml.data import taiwan_bankruptcy_dataset as taiwan

pytestmark = pytest.mark.skipif(not taiwan.DEFAULT_PATH.exists(), reason="Taiwan data not downloaded")


def test_column_meanings_hold_and_cleaning_is_reported():
    df, info = taiwan.load()
    # Debt ratio + net worth / assets = 1 (both rescaled the same way by the publisher).
    assert ((df["debt_ratio"] + df["net_worth_assets"] - 1).abs() <= 0.01).all()
    assert info["cleaning"]["constant"] == ["net_income_flag"] and "net_income_flag" not in df
    # Columns kept on the 0-1 scale have no impossible values left.
    scaled = [c for c in info["labels"] if c not in info["cleaning"]["unscaled"]]
    assert (df[scaled].max() <= 1).all()


def test_splits_keep_every_company_once():
    data = taiwan.dataset()
    seen = [set(part["company"]) for part in data.parts.values()]
    assert sum(len(s) for s in seen) == len(set().union(*seen)) == 6_819
