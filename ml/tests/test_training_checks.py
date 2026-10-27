import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedGroupKFold

from finext_ml import train_and_compare
from finext_ml.data.dataset_definition import altman_score
from finext_ml.evaluation import evaluation_metrics
from finext_ml.models.candidate_models import CANDIDATES


def toy(n_groups=60, months=12, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for g in range(n_groups):
        weak = rng.random() < 0.3
        for t in range(months):
            x = rng.normal(-1 if weak else 1, 1)
            rows.append({"business": g, "x": x, "noise": rng.normal(), "y": int(x + rng.normal(0, 0.5) < -0.5)})
    return pd.DataFrame(rows)


def test_bootstrap_interval_contains_the_point_estimate():
    df = toy()
    p = 1 / (1 + np.exp(2 * df["x"]))
    point = evaluation_metrics.pr_auc(df["y"], p)
    ci = evaluation_metrics.bootstrap_intervals(df["y"], p, df["business"], threshold=0.5, draws=200)
    assert ci["pr_auc"][0] <= point <= ci["pr_auc"][1]
    assert 0 <= ci["recall"][0] <= ci["recall"][1] <= 1


def test_boosted_tuning_uses_early_stopping_and_the_one_standard_error_rule():
    df = toy()
    folds = list(StratifiedGroupKFold(n_splits=3, shuffle=True, random_state=0).split(df, df["y"], groups=df["business"]))
    xgb = next(c for c in CANDIDATES if c.name == "xgboost")
    best = train_and_compare.tune(xgb, df, "y", "business", ["x", "noise"], {"x": -1}, folds, n_iter=4)
    assert 1 <= best["final_params"]["n_estimators"] <= 1000
    s = best["search"]
    assert s["chosen_cv"] >= s["best_cv"] - np.std(best["fold_pr_auc"]) - 1e-9  # within reach of the best
    assert s["chosen_gap"] <= s["best_cv_gap"] + 1e-9                           # and memorises no more


def test_learning_curve_reports_each_share():
    df = toy()
    folds = list(StratifiedGroupKFold(n_splits=3, shuffle=True, random_state=0).split(df, df["y"], groups=df["business"]))
    lr = next(c for c in CANDIDATES if c.name == "logistic_regression")
    curve = train_and_compare.learning_curve(lr, {"C": 1.0}, 2.0, df, "y", "business", ["x", "noise"], {}, folds)
    assert [c["share"] for c in curve] == list(train_and_compare.LEARNING_CURVE)
    assert curve[0]["businesses"] < curve[-1]["businesses"]


def test_altman_baseline_flags_the_distress_zone():
    frame = pd.DataFrame({"wc": [0.3, -0.2, np.nan], "re": [0.4, -0.5, 0.1], "ebit": [0.15, -0.1, 0.1],
                          "eq": [2.0, 0.1, 1.0], "sales": [1.5, 0.5, 1.0], "one": 1.0})
    score, alert = altman_score("wc", "re", "ebit", "eq", "sales", "one", "one",
                                weights=(0.717, 0.847, 3.107, 0.420, 0.998), cutoff=1.23)
    z = -score(frame)
    assert z[0] > 1.23 > z[1]                       # healthy vs distressed
    assert (score(frame) >= alert).tolist() == [False, True, False]  # not computable: no alert


def test_explanations_say_why_a_value_is_missing():
    from finext_ml.evaluation.shap_explanations import top_drivers
    features = ["drawings_to_profit", "cash_runway", "receipt_share"]
    row = pd.Series({"drawings_to_profit": np.nan, "cash_runway": 0.25, "receipt_share": np.nan, "reason_receipt_share": "no_data"})
    drivers = {d["feature"]: d for d in top_drivers(np.array([0.5, 2.0, 0.1]), row, features, {f: f for f in features},
                                                   {"drawings_to_profit": "no profit this month"})}
    assert drivers["drawings_to_profit"]["value_text"] == "no profit this month"  # specific to the feature
    assert drivers["receipt_share"]["value_text"] == "not recorded"              # from the reason code
    assert drivers["cash_runway"]["value_text"] == "0.25" and drivers["cash_runway"]["direction"] == "raises risk"
