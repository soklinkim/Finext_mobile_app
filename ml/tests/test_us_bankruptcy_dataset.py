import numpy as np
import pandas as pd
import pytest

from finext_ml.preprocessing import us_bankruptcy_features
from finext_ml.data import us_bankruptcy_dataset
from finext_ml.train_and_compare import choose_winner

HAVE_DATA = us_bankruptcy_dataset.DEFAULT_PATH.exists()


def test_restore_decimals_divides_cells_that_lost_their_point():
    cells = pd.Series(["511267", "701.854", "-12345", "0", "1.5e-05", "336.01800000000003"])
    assert us_bankruptcy_dataset._restore_decimals(cells).tolist() == pytest.approx([511.267, 701.854, -12.345, 0.0, 1.5e-05, 336.018])


@pytest.mark.skipif(not HAVE_DATA, reason="raw US dataset not downloaded (see ml/README.md)")
def test_corrected_data_satisfies_accounting_identities():
    shares = us_bankruptcy_dataset.identity_shares(us_bankruptcy_dataset.load())
    assert all(share > 0.999 for share in shares.values()), shares


def frame(rows):
    df = pd.DataFrame(rows, columns=["company", "year", "ever_failed"])
    for name in us_bankruptcy_dataset.COLUMNS.values():
        df[name] = 100.0
    df["division"] = "D"
    return df


def test_only_a_failed_companys_last_year_is_positive():
    df = frame([("A", 2001, True), ("A", 2002, True), ("A", 2003, True), ("B", 2001, False), ("B", 2002, False)])
    assert us_bankruptcy_dataset.fails_next_year(df).tolist() == [0, 0, 1, 0, 0]


def test_features_use_only_the_current_and_earlier_years():
    df = frame([("A", year, False) for year in range(2001, 2008)])
    df["revenue"] = [100, 120, 90, 80, 150, 60, 200]
    df["net_income"] = [5, -1, -2, 3, -4, -5, -6]
    full = us_bankruptcy_features.build(df)
    for cutoff in range(2001, 2008):
        partial = us_bankruptcy_features.build(df[df["year"] <= cutoff].reset_index(drop=True))
        pd.testing.assert_series_equal(full.loc[full["year"] == cutoff, us_bankruptcy_features.FEATURES].iloc[0],
                                       partial.loc[partial["year"] == cutoff, us_bankruptcy_features.FEATURES].iloc[0], check_names=False)


def test_trends_and_streaks_restart_after_a_gap_in_the_years():
    df = frame([("A", 2001, False), ("A", 2002, False), ("A", 2005, False)])
    df["net_income"] = -1.0
    out = us_bankruptcy_features.build(df)
    assert out["loss_streak"].tolist() == [1, 2, 1]
    assert np.isnan(out["revenue_growth"].iloc[2])  # no 2004 figures to compare with


def test_ratios_with_no_meaningful_denominator_are_missing_not_zero():
    df = frame([("A", 2001, False)])
    df["revenue"], df["inventory"], df["total_liabilities"] = 0.0, 0.0, 150.0
    out = us_bankruptcy_features.build(df).iloc[0]
    assert np.isnan(out["net_margin"]) and np.isnan(out["inventory_days"]) and np.isnan(out["liabilities_to_equity"])
    assert out["negative_equity"] == 1


@pytest.mark.skipif(not HAVE_DATA, reason="raw US dataset not downloaded (see ml/README.md)")
def test_splits_keep_holdout_companies_and_later_years_out_of_training():
    parts = us_bankruptcy_dataset.dataset().parts
    train = set(parts["train"]["company"])
    assert not train & set(parts["company_holdout"]["company"])
    assert parts["train"]["year"].max() <= 2011 < parts["validation"]["year"].min()
    assert parts["validation"]["year"].max() <= 2014 < parts["time_holdout"]["year"].min()


def result(folds, calibration=0.002, worst_segment=0.05):
    return {"cv": {"fold_pr_auc": folds, "pr_auc_mean": float(np.mean(folds))},
            "validation": {"calibration_error": calibration}, "worst_segment_pr_auc": worst_segment}


def test_a_challenger_must_clear_every_check_to_replace_xgboost():
    champion = [0.10, 0.10, 0.10, 0.10, 0.10]
    results = {
        "xgboost": result(champion),
        "lightgbm": result([0.13, 0.13, 0.12, 0.13, 0.13]),                         # clears everything
        "random_forest": result([0.20, 0.20, 0.09, 0.09, 0.09]),                     # big mean gain, wins only 2 folds
        "logistic_regression": result([0.13, 0.13, 0.13, 0.13, 0.13], calibration=0.01),  # worse calibration
    }
    winner, decisions = choose_winner(results, margin=0.02, folds_lost_allowed=1)
    assert winner == "lightgbm"
    assert not decisions["random_forest"]["consistent_across_folds"]
    assert not decisions["logistic_regression"]["calibration_no_worse"]
    winner, _ = choose_winner({k: v for k, v in results.items() if k != "lightgbm"}, margin=0.02, folds_lost_allowed=1)
    assert winner == "xgboost"
