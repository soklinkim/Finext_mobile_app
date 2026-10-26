"""What the training pipeline needs to know about a dataset, so the same code trains on any of them."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd


@dataclass
class Dataset:
    name: str
    target: str
    group: str                         # the business (or company) id: never split across train and test
    features: list[str]
    labels: dict[str, str]             # business-friendly feature names (spec C6)
    monotone: dict[str, int]           # +1: higher means more risk, -1: less risk
    parts: dict[str, pd.DataFrame]     # train, validation, time_holdout, company_holdout
    # Segment label per row, from a frame and the training part (e.g. size bands cut on training data).
    segments: dict[str, Callable[[pd.DataFrame, pd.DataFrame], np.ndarray]]
    card: dict                         # model card text: title, warning, data, target, splits, limitations
    optional_features: list[str] = field(default_factory=list)  # tested with and without (spec C5: Layer 1)
    confidence: Callable[[pd.Series], str] = lambda row: "normal"
    missing_text: dict[str, str] = field(default_factory=dict)  # why a feature can be missing, in plain words
    # Simple rules the model must beat: name -> (score per row, alert when score >= this).
    baselines: dict[str, tuple[Callable[[pd.DataFrame], np.ndarray], float]] = field(default_factory=dict)
    # Rows already in trouble now; the rest measure early warning (the label looks ahead).
    already_stressed: Callable[[pd.DataFrame], np.ndarray] | None = None


def size_bands(column: str) -> Callable[[pd.DataFrame, pd.DataFrame], np.ndarray]:
    """Small / medium / large by terciles of `column` in the training part."""
    def bands(frame: pd.DataFrame, train: pd.DataFrame) -> np.ndarray:
        cuts = np.nanquantile(train[column], [1 / 3, 2 / 3])
        return np.select([frame[column] <= cuts[0], frame[column] <= cuts[1]], ["small", "medium"], "large")
    return bands


def holdout_groups(frame: pd.DataFrame, group: str, stratify: str, share: float, seed: int) -> set:
    """A share of businesses held out entirely, drawn separately among those with and without the outcome."""
    by_group = frame.groupby(group)[stratify].max()
    rng = np.random.default_rng(seed)
    held: set = set()
    for flag in (True, False):
        names = np.sort(by_group[by_group.astype(bool) == flag].index.to_numpy())
        held |= set(rng.choice(names, size=round(len(names) * share), replace=False))
    return held


def altman_score(working_capital, retained_earnings, ebit, equity, sales, total_assets, total_liabilities,
                 weights: tuple[float, ...], cutoff: float) -> tuple[Callable[[pd.DataFrame], np.ndarray], float]:
    """Altman's Z (a weighted sum of five ratios) as a baseline: returns −Z per row (higher = riskier) and the
    alert point (−cutoff: Z below the distress cutoff). Rows it cannot compute count as no alert."""
    def score(frame: pd.DataFrame) -> np.ndarray:
        assets, liabilities = frame[total_assets], frame[total_liabilities]
        ratios = [frame[working_capital] / assets, frame[retained_earnings] / assets, frame[ebit] / assets,
                  frame[equity] / liabilities, frame[sales] / assets]
        z = sum(w * r for w, r in zip(weights, ratios)).replace([np.inf, -np.inf], np.nan)
        return (-z).fillna(-1e9).to_numpy(dtype=float)
    return score, -cutoff
