"""Check FINEXT's risk model on a lender's own past loans, without the data leaving the lender.

The lender fills `lender_validation_template.csv` from its records (one row per loan: the business's figures when the
loan was made, and whether it later went bad), then runs, from the backend folder:

    venv/Scripts/python.exe scripts/validate_lender_data.py loans.csv
    venv/Scripts/python.exe scripts/validate_lender_data.py loans.csv --out report.md

It scores every loan exactly as the app would (the same ratio formulas in app/risk_features.py, the same handling of
gaps in app/risk.py, the same model and Cambodian base rate) and writes a short report of summary figures only: how
well the scores rank good and bad loans, how many bad loans the alert caught, and predicted against actual bad-loan
rates. The report holds no loan, no business and no figure from any single row, so it can be shared. It refuses to
run with fewer than MIN_EACH bad or good loans, and hides any group of fewer than MIN_GROUP loans.

Columns (amounts in any one currency; ratios do not depend on it). Flows cover the 12 months before the figures date,
balances are at that date. Leave an optional column blank when it is not known: the ratios that need it are left
missing, as in the model's training data, never estimated.

  bad_within_12m        1 if the loan went 90+ days overdue or was written off within 12 months, else 0   (required)
  sales                 sales over the 12 months                                                         (required)
  cost_of_goods_sold    cost of the goods sold over the 12 months                                        (required)
  operating_profit      sales less cost of goods and running costs, before interest and tax              (required)
  net_profit            profit after interest and tax                                                    (required)
  total_assets          everything the business owns                                                      (required)
  current_assets        cash, money owed by customers, stock, prepayments                                 (required)
  receivables           money customers owe the business                                                  (required)
  inventory             stock                                                                             (required)
  current_liabilities   bills and loans due within 12 months, including this year's part of longer loans (required)
  total_liabilities     everything the business owes                                                      (required)
  equity                owner's equity; blank = total_assets - total_liabilities                          (optional)
  retained_earnings     profit kept in the business over the years                                        (optional)
  sales_prior_year      sales over the 12 months before that; blank = treated as no change, as in the app  (optional)
  operating_expenses    running costs excluding cost of goods, interest and tax, including depreciation   (optional)
  depreciation          depreciation over the 12 months                                                   (optional)
  interest_paid         interest over the 12 months                                                       (optional)
  income_tax            income tax over the 12 months                                                     (optional)
  cash                  cash and bank balances                                                            (optional)
"""
from __future__ import annotations

import argparse
import csv
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.risk import model_inputs  # noqa: E402
from app.risk_features import FEATURES, risk_features  # noqa: E402
from app.risk_model import default_model  # noqa: E402

MIN_EACH = 30   # bad and good loans each: below this the figures say little and single loans could stand out
MIN_GROUP = 10  # smallest group shown in the report
REQUIRED = ["bad_within_12m", "sales", "cost_of_goods_sold", "operating_profit", "net_profit", "total_assets", "current_assets",
            "receivables", "inventory", "current_liabilities", "total_liabilities"]
OPTIONAL = ["equity", "retained_earnings", "sales_prior_year", "operating_expenses", "depreciation", "interest_paid",
            "income_tax", "cash"]
# Ratios that cannot be worked out when an optional figure is blank (see the formulas in app/risk_features.py).
NEEDS = {
    "retained_earnings": ["retained_earnings_to_assets"],
    "operating_expenses": ["liquid_days_of_expenses", "costs_to_sales"],
    "depreciation": ["liquid_days_of_expenses", "cash_earnings_to_liabilities"],
    "interest_paid": ["interest_coverage", "costs_to_sales"],
    "income_tax": ["pretax_margin"],
    "cash": ["liquid_days_of_expenses"],
}


def _number(text: str | None) -> float | None:
    text = (text or "").strip().replace(",", "")
    if not text:
        return None
    value = float(text)
    if not math.isfinite(value):
        raise ValueError("not a number")
    return value


def read_loans(path: Path) -> tuple[list[dict], int]:
    """Rows with every required figure; returns them and how many were skipped for a missing or bad value."""
    loans, skipped = [], 0
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(f"Missing columns: {', '.join(missing)}. Start from lender_validation_template.csv.")
        for row in reader:
            try:
                values = {c: _number(row.get(c)) for c in REQUIRED + OPTIONAL}
            except ValueError:
                skipped += 1
                continue
            if any(values[c] is None for c in REQUIRED) or values["bad_within_12m"] not in (0, 1):
                skipped += 1
                continue
            loans.append(values)
    return loans, skipped


def _snapshots(loan: dict) -> list[dict]:
    """The loan's figures as the app's monthly books: twelve months of flows ending at the figures date (the year's
    totals split evenly; the app adds them back up), the balances at that date, and the year before for sales growth."""
    blank = lambda name: loan[name] if loan[name] is not None else 0.0  # noqa: E731  (its ratios are removed later)
    equity = loan["equity"] if loan["equity"] is not None else loan["total_assets"] - loan["total_liabilities"]
    retained = blank("retained_earnings")
    year = {"revenue": loan["sales"], "cogs": loan["cost_of_goods_sold"], "operating_expenses": blank("operating_expenses"),
            "depreciation": blank("depreciation"), "ebit": loan["operating_profit"], "interest": blank("interest_paid"),
            "tax": blank("income_tax"), "net_profit": loan["net_profit"]}
    month = {name: value / 12 for name, value in year.items()}
    balances = {"total_assets": loan["total_assets"], "current_assets": loan["current_assets"], "receivables": loan["receivables"],
                "inventory": loan["inventory"], "cash": blank("cash"), "current_liabilities": loan["current_liabilities"],
                "total_liabilities": loan["total_liabilities"], "equity": equity, "owner_capital": equity - retained,
                "instalments_due_12m": 0}  # current_liabilities already includes this year's part of longer loans
    recent = [{"period": f"m{i}", "complete": True, "features": {**month, **(balances if i == 11 else {})}} for i in range(12)]
    if loan["sales_prior_year"] is None:
        return recent
    earlier = [{"period": f"p{i}", "complete": True, "features": {"revenue": loan["sales_prior_year"] / 12}} for i in range(12)]
    return earlier + recent


def model_row(loan: dict, ranges: dict) -> dict:
    """The model's inputs for one loan, as the app builds them; ratios needing a blank figure are left missing."""
    inputs = risk_features(_snapshots(loan))
    for column, ratios in NEEDS.items():
        if loan[column] is None:
            for name in ratios:
                inputs["features"][name] = None
                inputs["reasons"].pop(name, None)  # unknown, not "none owed": no healthy value is put in its place
    features, _, _ = model_inputs(inputs, ranges)
    return features


def roc_auc(y: np.ndarray, p: np.ndarray) -> float:
    """Chance that a bad loan scores above a good one (ties count half)."""
    _, group, counts = np.unique(p, return_inverse=True, return_counts=True)
    first = np.cumsum(counts) - counts  # tied scores share the average of the ranks they span
    ranks = (first + (counts + 1) / 2)[group]
    bad = y == 1
    return float((ranks[bad].sum() - bad.sum() * (bad.sum() + 1) / 2) / (bad.sum() * (~bad).sum()))


def average_precision(y: np.ndarray, p: np.ndarray) -> float:
    order = np.argsort(-p, kind="mergesort")
    hits = y[order]
    precision = np.cumsum(hits) / np.arange(1, len(hits) + 1)
    return float((precision * hits).sum() / hits.sum())


def at(y: np.ndarray, flagged: np.ndarray) -> dict:
    caught = int((flagged & (y == 1)).sum())
    return {"flagged": int(flagged.sum()), "caught": caught, "recall": caught / int(y.sum()),
            "precision": caught / int(flagged.sum()) if flagged.any() else 0.0}


def evaluate(loans: list[dict]) -> dict:
    model = default_model()
    rows = [model_row(loan, model.meta.get("range", {})) for loan in loans]
    p = model.probability(rows)
    y = np.array([int(loan["bad_within_12m"]) for loan in loans])
    rng = np.random.default_rng(0)
    draws = []
    for _ in range(300):  # 95% range of the ranking score, resampling loans
        pick = rng.integers(0, len(y), len(y))
        if 0 < y[pick].sum() < len(pick):
            draws.append(roc_auc(y[pick], p[pick]))
    bands = {}
    for band in ("low", "moderate", "high"):
        inside = np.array([model.band(float(v)) == band for v in p])
        n = int(inside.sum())
        bands[band] = {"loans": n, "predicted": float(p[inside].mean()) if n else None, "actual": float(y[inside].mean()) if n else None}
    return {
        "loans": len(y), "bad": int(y.sum()), "bad_rate": float(y.mean()), "mean_predicted": float(p.mean()),
        "roc_auc": roc_auc(y, p), "roc_auc_range": [float(np.percentile(draws, 2.5)), float(np.percentile(draws, 97.5))],
        "pr_auc": average_precision(y, p),
        "alert": at(y, p >= model.alert_threshold) | {"threshold": float(model.alert_threshold)},
        "loss_making": at(y, np.array([loan["net_profit"] < 0 for loan in loans])),
        "bands": bands, "blank": {c: sum(loan[c] is None for loan in loans) for c in OPTIONAL},
        "model_version": model.meta["model_version"], "local_rate": (model.meta.get("local_prior") or {}).get("rate"),
    }


def report(r: dict, skipped: int, source: str) -> str:
    pct = lambda v: "–" if v is None else f"{v:.1%}"  # noqa: E731
    shown = lambda n: f"{n:,}" if n >= MIN_GROUP else f"under {MIN_GROUP}"  # noqa: E731
    a, base = r["alert"], r["loss_making"]
    lines = [
        "# FINEXT risk model: check on past loans",
        "",
        f"Data: {source}. Model: `{r['model_version']}`, percentages set to a {pct(r['local_rate'])} bad-loan rate.",
        "Summary figures only: no loan, business or single figure from the data appears here.",
        "",
        "| | |", "|---|---:|",
        f"| Loans checked | {r['loans']:,} |",
        f"| Skipped (a required figure missing or not a number) | {skipped:,} |",
        f"| Went bad within 12 months | {r['bad']:,} ({pct(r['bad_rate'])}) |",
        "",
        "## How well the scores rank the loans",
        "",
        f"- **Ranking (ROC-AUC): {r['roc_auc']:.3f}** (95% range {r['roc_auc_range'][0]:.3f}–{r['roc_auc_range'][1]:.3f}). "
        "The chance that a loan that went bad scored higher than one that did not: 0.5 is guessing, 1.0 is perfect; "
        "bank scorecards are usually 0.70–0.85.",
        f"- **PR-AUC: {r['pr_auc']:.3f}**, against {r['bad_rate']:.3f} for guessing (the bad-loan rate).",
        "",
        "## The alert (the app's \"warning\" line)",
        "",
        "| | FINEXT alert | Simple rule: loss-making |", "|---|---:|---:|",
        f"| Bad loans caught | {pct(a['recall'])} | {pct(base['recall'])} |",
        f"| Alerts that were real bad loans | {pct(a['precision'])} | {pct(base['precision'])} |",
        f"| Share of loans flagged | {pct(a['flagged'] / r['loans'])} | {pct(base['flagged'] / r['loans'])} |",
        "",
        "## Predicted against actual",
        "",
        f"Average predicted {pct(r['mean_predicted'])}, actual {pct(r['bad_rate'])}. If they differ a lot, the ranking above "
        "still holds; the percentages need recalibrating to this lender's rate.",
        "",
        "| Level | Loans | Predicted | Actually went bad |", "|---|---:|---:|---:|",
    ]
    for band, b in r["bands"].items():
        hide = b["loans"] < MIN_GROUP
        lines.append(f"| {band} | {shown(b['loans'])} | {'–' if hide else pct(b['predicted'])} | {'–' if hide else pct(b['actual'])} |")
    blanks = [f"{c} ({n:,})" for c, n in r["blank"].items() if n and c in NEEDS]
    lines += ["", "Optional figures left blank, so the ratios using them were missing for those loans: "
              + (", ".join(blanks) if blanks else "none") + "."]
    if blanks:  # the model learned that a missing figure usually meant trouble
        lines += ["In the model's training data a missing figure usually meant a company in trouble, so blanks push "
                  "scores and alerts up. Fill as many optional columns as the records allow."]
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv", type=Path)
    parser.add_argument("--out", type=Path, help="where to write the report (default: next to the CSV)")
    parser.add_argument("--source", default="lender's own past loans", help="how the data is described in the report")
    args = parser.parse_args(argv)
    loans, skipped = read_loans(args.csv)
    bad = sum(int(loan["bad_within_12m"]) for loan in loans)
    if bad < MIN_EACH or len(loans) - bad < MIN_EACH:
        print(f"Needs at least {MIN_EACH} bad and {MIN_EACH} good loans with every required figure "
              f"(found {bad} bad, {len(loans) - bad} good, {skipped} skipped). No report written.")
        return 1
    text = report(evaluate(loans), skipped, args.source)
    out = args.out or args.csv.with_name(args.csv.stem + "_finext_report.md")
    out.write_text(text, encoding="utf-8")
    print(text)
    print(f"Report written to {out}. It holds summary figures only and can be shared.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
