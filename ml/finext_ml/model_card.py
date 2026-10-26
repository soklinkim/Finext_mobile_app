"""Model card for a training run (spec C5b: all four models' results, the selection, and the limitations)."""
from __future__ import annotations

NAMES = {"xgboost": "XGBoost", "logistic_regression": "Logistic Regression", "random_forest": "Random Forest", "lightgbm": "LightGBM"}


def _f(value, digits: int = 3) -> str:
    return "—" if value is None else f"{value:.{digits}f}"


def write(r: dict) -> str:
    d, w = r["data"], r["winner"]
    lines = [
        f"# Model card: {r['model_version']}",
        "",
        "> **Research baseline, not for scoring FINEXT businesses.** Trained on annual accounts of US listed companies "
        "to predict bankruptcy within one year. FINEXT's target (stress in the next 3 months for an MSME, from monthly "
        "snapshots) needs FINEXT-shaped data; this run proves the training, selection and explanation pipeline. "
        "Describe any output as *likely deterioration*, never as a prediction of loan default.",
        "",
        "## Data",
        f"- US Company Bankruptcy Prediction (sowide/bankruptcy_dataset, CC BY 4.0; Lombardo et al. 2022). "
        f"{d['rows']:,} company-years, {d['companies']:,} companies, 1999–2018. File SHA-256 `{d['sha256'][:16]}…`.",
        "- Corrections applied before training: lost decimal points restored (cells 1000× too large), and X1–X18 "
        "remapped to their real meanings. Identity checks after correction: "
        + ", ".join(f"{k} {v:.2%}" for k, v in d["identities"].items()) + ".",
        f"- **Target** `fails_next_year`: 1 on a failed company's last reported year only ({d['positives']} positives, "
        f"{d['positives'] / d['rows']:.2%}). The raw `status_label` marks every year of a failed company and is not used as the target.",
        "",
        "| Split | Rows | Companies | Positives |",
        "|---|---:|---:|---:|",
        *[f"| {k.replace('_', ' ')} | {v['rows']:,} | {v['companies']:,} | {v['positives']} |" for k, v in d["splits"].items()],
        "",
        "Train 1999–2011 (grouped CV by company inside), validation 2012–2014, time holdout 2015–2018; "
        "company holdout = 20% of companies never seen in training.",
        "",
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
        f"Base rate is under 1%, so a random model scores PR-AUC ≈ 0.01. Probabilities are Platt-calibrated on out-of-fold scores. "
        "The train column scores each model on the rows it was fitted on: a large gap to CV means it memorises training cases.",
        "",
        "## Selection",
        f"XGBoost is the champion. A challenger replaces it only if it gains ≥ {rule['margin']} CV PR-AUC on average, wins in "
        f"≥ {r['folds'] - rule['folds_lost_allowed']} of {r['folds']} folds, and its calibration error and worst-segment PR-AUC are no worse.",
        "",
        "| Challenger | PR-AUC gain | Folds won | Margin | Consistent | Calibration | Segments | Replaces |",
        "|---|---:|---:|:-:|:-:|:-:|:-:|:-:|",
    ]
    tick = lambda ok: "✓" if ok else "✗"
    for name, s in r["selection"].items():
        lines.append(f"| {NAMES[name]} | {s['mean_pr_auc_gain']:+.3f} | {s['folds_won']} | {tick(s['beats_margin'])} | "
                     f"{tick(s['consistent_across_folds'])} | {tick(s['calibration_no_worse'])} | {tick(s['segments_no_worse'])} | {tick(s['replaces_champion'])} |")
    lines += ["", f"**Winner: {NAMES[w]}.**", "", "## Winner on the holdouts (scored once, after selection)", "",
              f"Alert threshold {r['alert_threshold']:.4f}, set on validation to catch ≥ {r['recall_target']:.0%} of failures.", "",
              "| Holdout | PR-AUC | ROC-AUC | Brier | Calibration error | Precision | Recall | F1 | Accuracy | Recall at precision ≥ "
              f"{r['min_precision']:.0%} |",
              "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for name, h in r["holdout"].items():
        t = h["at_alert_threshold"]
        lines.append(f"| {name.replace('_', ' ')} ({h['positives']} failures in {h['rows']:,}) | {_f(h['pr_auc'])} | {_f(h['roc_auc'])} | "
                     f"{_f(h['brier'], 4)} | {_f(h['calibration_error'], 4)} | {_f(t['precision'])} | {_f(t['recall'])} | {_f(t['f1'])} | "
                     f"{_f(t['accuracy'])} | {_f(h['recall_at_precision'])} |")
    for name, h in r["holdout"].items():
        c = h["at_alert_threshold"]["confusion"]
        lines.append(f"\n{name.replace('_', ' ').capitalize()} confusion matrix at the alert threshold: "
                     f"{c['tp']} failures caught, {c['fn']} missed, {c['fp']} false alarms, {c['tn']} correctly left alone.")
    lines += ["", "Accuracy is shown for completeness only: predicting \"no failure\" for everyone would score above 99%.", "",
              "## What drives the predictions (mean |SHAP| on validation, top 5)", ""]
    for name, top in r["shap_global"].items():
        lines.append(f"- **{NAMES[name]}**: " + "; ".join(item["label"] for item in top[:5]))
    lines += [
        "",
        "## Limitations",
        "- US listed companies, annual accounts, 1999–2018: far larger and differently financed than Cambodian MSMEs.",
        "- No cash, operating cash flow, interest, payables or loan schedules in the data, so the spec's cash ratio, OCF, "
        "DSCR, cash runway and repayment-burden features are missing, and the `stress_3m` label cannot be built from it.",
        "- \"Failed\" means a Chapter 7 / 11 filing; companies that left the market for other reasons count as not failed.",
        "- Thresholds and risk bands (0.30 / 0.60) are the spec's proposals; with a base rate under 1%, few rows reach them.",
        "- Layer 1 (rule) features are not tested here: the US data has no FINEXT signals.",
        "",
        f"Run {r['run_id']}, {r['minutes']} min. Seed {r['seed']}. " + ", ".join(f"{k} {v}" for k, v in r["versions"].items()) + ".",
    ]
    return "\n".join(lines) + "\n"
