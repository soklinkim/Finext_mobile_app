import numpy as np
import pandas as pd

from finext_ml.data import sme_simulator
from finext_ml.preprocessing import finext_features
from app.accounting_validation import validate_bookkeeping_data  # backend, put on the path by finext_ml.data.sme_simulator
from app.bookkeeping import relation_errors


def test_simulated_entries_pass_finext_validation():
    for i in range(3):
        business = sme_simulator.make_business(i, np.random.default_rng(i), 18)
        entries = business.run()
        assert validate_bookkeeping_data(entries, [sme_simulator.CASH]) == []
        seen = {}
        for row in entries:  # payments, write-offs and reversals must fit what they point to, in order
            seen[row["id"]] = row
            assert relation_errors(row, seen) is None, row


def snapshot(runway=3.0, ocf=100, dscr=None):
    return {"cash_runway": runway, "ocf": ocf, "dscr": dscr}


def test_stress_label_reads_only_the_next_three_months():
    calm = [snapshot()] * 5
    assert sme_simulator.stress_3m(calm, 0) == 0
    assert sme_simulator.stress_3m([snapshot(runway=0.1)] + calm, 0) == 0          # trouble now is an input, not the label
    assert sme_simulator.stress_3m([snapshot(), snapshot(), snapshot(runway=0.4), snapshot(), snapshot()], 0) == 1
    assert sme_simulator.stress_3m([snapshot()] + [snapshot(ocf=-1)] * 3 + [snapshot()], 0) == 1
    assert sme_simulator.stress_3m([snapshot()] + [snapshot(ocf=-1)] * 2 + [snapshot()] * 2, 0) == 0  # 2 months is not 3
    assert sme_simulator.stress_3m([snapshot()] * 3 + [snapshot(dscr=0.9)], 0) == 1
    assert sme_simulator.stress_3m(calm, 3) is None                                # not enough future to label
    assert sme_simulator.stress_3m([snapshot(), None, snapshot(), snapshot()], 0) is None


def test_three_month_trends_compare_with_exactly_three_months_earlier():
    raw = pd.DataFrame({"business": "B1", "t": [0, 1, 2, 3, 5], "cash_runway": [1.0, 2.0, 3.0, 4.0, 9.0]})
    for column in set(finext_features.SNAPSHOT_FEATURES + ["ocf", "revenue", "ocf_avg_3m", "revenue_avg_3m", "revenue_change",
                                                          "cash_change", "usual_monthly_expenses", "ar_overdue_31_60",
                                                          "ar_overdue_61_plus", "ap_overdue_31_60", "ap_overdue_61_plus",
                                                          "debt_service_next_month", "instalments_due_14d", "cash",
                                                          "new_borrowing_6m", "debt"]) - {"cash_runway"}:
        raw[column] = 1.0
    out = finext_features.build_features(raw)
    change = out["cash_runway_change_3m"]
    assert change.iloc[:3].isna().all()          # no month three earlier
    assert change.iloc[3] == 3.0                 # t=3 against t=0
    assert change.iloc[4] == 6.0                 # t=5 against t=2, although t=4 is missing
