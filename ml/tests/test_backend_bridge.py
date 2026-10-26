"""The backend computes the model's inputs from FINEXT books; they must be the training features, in order."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app import risk_features  # noqa: E402

from finext_ml.data import polish_bankruptcy_dataset  # noqa: E402


def test_backend_features_are_the_training_features_in_order():
    assert risk_features.FEATURES == polish_bankruptcy_dataset.FEATURES
