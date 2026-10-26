"""Model card for a training run (spec C5b: all four models' results, the selection, and the limitations)."""
from __future__ import annotations

NAMES = {"xgboost": "XGBoost", "logistic_regression": "Logistic Regression", "random_forest": "Random Forest", "lightgbm": "LightGBM"}


def _f(value, digits: int = 3) -> str:
    return "—" if value is None else f"{value:.{digits}f}"


def write(r: dict) -> str:
    d, w, card, target = r["data"], r["winner"], r["card"], r["target"]
    rate = d["positives"] / d["rows"]
    lines = [
        f"# Model card: {r['model_version']}",
        "",
        f"> {card['warning']}",
        "",
        "## Data",
        *[f"- {line}" for line in card["data"]],
        *([f"- Source file SHA-256 `{d['sha256'][:16]}…`."] if d.get("sha256") else []),
        "",
        "| Split | Rows | Businesses | Positives |",
        "|---|---:|---:|---:|",
        *[f"| {k.replace('_', ' ')} | {v['rows']:,} | {v['groups']:,} | {v['positives']:,} |" for k, v in d["splits"].items()],
        "",
        card["splits"],
        "",
    ]
    if r.get("layer1"):
        l1 = r["layer1"]
        lines += ["## Layer 1 (rule) features",
                  f"XGBoost with and without the rule-based dimension counts (spec C5): CV PR-AUC {l1['without']:.3f} without, "
                  f"{l1['with']:.3f} with ({l1['gain']:+.3f}). They are **{'kept' if l1['kept'] else 'left out'}** "
                  f"(kept only if they add ≥ {l1['margin']}).", ""]
    lines += [
        f"## Candidates ({r['folds']}-fold grouped CV, up to {r['configs_per_model']} configurations each)",
        "",
        "| Model | CV PR-AUC (mean ± sd) | CV ROC-AUC | Train PR-AUC / ROC-AUC | Validation PR-AUC | Validation calibration error | Worst segment PR-AUC |",
        "|---|---|---:|---:|---:|---:|---:|",
    ]
    for name, c in r["candidates"].items():
        mark = " **(winner)**" if name == w else ""
        lines.append(f"| {NAMES[name]}{mark} | {_f(c['cv']['pr_auc_mean'])} ± {_f(c['cv']['pr_auc_std'])} | {_f(c['cv']['roc_auc_oof'])} | "
                     f"{_f(c['train']['pr_auc'])} / {_f(c['train']['roc_auc'])} | "
                     f"{_f(c['validation']['pr_auc'])} | {_f(c['validation']['calibration_error'], 4)} | {_f(c['worst_segment_pr_auc'])} |")
    rule = r["selection_rule"]
    lines += [
        "",
        f"Positives are {rate:.1%} of rows, so a random model scores PR-AUC ≈ {rate:.3f}. Probabilities are Platt-calibrated on "
        "out-of-fold scores. The train column scores each model on the rows it was fitted on: a large gap to CV means it memorises training cases.",
        "",
        "## Selection",
        f"XGBoost is the champion. A challenger replaces it only if it gains ≥ {rule['margin']} CV PR-AUC on average, wins in "
        f"≥ {r['folds'] - rule['folds_lost_allowed']} of {r['folds']} folds, and its calibration error and worst-segment PR-AUC are no worse.",
        "",
        "| Challenger | PR-AUC gain | Folds won | Margin | Consistent | Calibration | Segments | Replaces |",
        "|---|---:|---:|:-:|:-:|:-:|:-:|:-:|",
    ]
    tick = lambda ok: "✓" if ok else "✗"  # noqa: E731
    for name, s in r["selection"].items():
        lines.append(f"| {NAMES[name]} | {s['mean_pr_auc_gain']:+.3f} | {s['folds_won']} | {tick(s['beats_margin'])} | "
                     f"{tick(s['consistent_across_folds'])} | {tick(s['calibration_no_worse'])} | {tick(s['segments_no_worse'])} | {tick(s['replaces_champion'])} |")
    lines += ["", f"**Winner: {NAMES[w]}.**", "", "## Winner on the holdouts (scored once, after selection)", "",
              f"Alert threshold {r['alert_threshold']:.4f}, set on validation to catch ≥ {r['recall_target']:.0%} of positives.", "",
              "| Holdout | PR-AUC | ROC-AUC | Brier | Calibration error | Precision | Recall | F1 | Accuracy | Recall at precision ≥ "
              f"{r['min_precision']:.0%} |",
              "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for name, h in r["holdout"].items():
        t = h["at_alert_threshold"]
        lines.append(f"| {name.replace('_', ' ')} ({h['positives']:,} positives in {h['rows']:,}) | {_f(h['pr_auc'])} | {_f(h['roc_auc'])} | "
                     f"{_f(h['brier'], 4)} | {_f(h['calibration_error'], 4)} | {_f(t['precision'])} | {_f(t['recall'])} | {_f(t['f1'])} | "
                     f"{_f(t['accuracy'])} | {_f(h['recall_at_precision'])} |")
    for name, h in r["holdout"].items():
        c = h["at_alert_threshold"]["confusion"]
        lines.append(f"\n{name.replace('_', ' ').capitalize()} at the alert threshold: {c['tp']} caught, {c['fn']} missed, "
                     f"{c['fp']} false alarms, {c['tn']} correctly left alone.")
    for name, h in r["holdout"].items():
        bands = h["risk_bands"]
        lines.append(f"\n{name.replace('_', ' ').capitalize()} risk bands (spec proposal: low < 0.30 ≤ moderate ≤ 0.60 < high): "
                     + "; ".join(f"{band} {b['count']:,} rows, {_f(b['observed_rate'], 2) if b['observed_rate'] is not None else '—'} observed"
                                 for band, b in bands.items()) + ".")
    lines += ["", f"Accuracy is shown for completeness only: predicting \"no {target}\" for everyone would score {1 - rate:.0%}.", "",
              "## What drives the predictions (mean |SHAP| on validation, top 5)", ""]
    for name, top in r["shap_global"].items():
        lines.append(f"- **{NAMES[name]}**: " + "; ".join(item["label"] for item in top[:5]))
    lines += ["", "## Limitations", *[f"- {line}" for line in card["limitations"]],
              "- Thresholds and risk bands (0.30 / 0.60) are the spec's proposals, not final.",
              "",
              f"Run {r['run_id']}, {r['minutes']} min. Seed {r['seed']}. " + ", ".join(f"{k} {v}" for k, v in r["versions"].items()) + "."]
    return "\n".join(lines) + "\n"
