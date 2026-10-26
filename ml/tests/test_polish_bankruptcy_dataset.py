import pytest

from finext_ml.data import polish_bankruptcy_dataset as polish

pytestmark = pytest.mark.skipif(not polish.DEFAULT_PATH.exists(), reason="Polish data not downloaded")


def test_attribute_meanings_hold_on_the_data():
    _, raw = polish.load()
    assert all(share > 0.999 for share in polish.identity_shares(raw).values())


def test_splits_keep_every_company_once():
    data = polish.dataset()
    seen = [set(part["company"]) for part in data.parts.values()]
    assert sum(len(s) for s in seen) == len(set().union(*seen))
    assert set(data.features) <= set(data.parts["train"].columns)
    assert "log_total_assets" not in data.features  # size is a segment, not an input
