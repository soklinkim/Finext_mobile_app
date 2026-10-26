"""Rules §12 Q4: estimating the cost of a product sale entered without one."""
from app.bookkeeping import estimated_costs, journal_for
from tests.test_settlement import BANKS, entry, reversal_of
from tests.test_worked_sample import on


def cost_lines(tx, history):
    return [(l["side"], l["accountCode"], l["amount"]) for l in journal_for(tx, BANKS, {}, estimated_costs(history))
            if l["accountCode"] in {"5000", "1200"}]


def test_benchmark_margin_until_there_is_history():
    sale = entry("s1", "product_sale", "in", 10_000, at=on(2025, 5, 10))
    assert estimated_costs([sale]) == {"s1": 6_700}  # 33% gross margin
    assert cost_lines(sale, [sale]) == [("debit", "5000", 6_700), ("credit", "1200", 6_700)]


def test_uses_the_last_three_complete_months_of_entered_costs():
    history = [
        entry("jan", "product_sale", "in", 50_000, meta={"cost": 10_000}, at=on(2025, 1, 20)),   # 4 months back: ignored
        entry("feb", "product_sale", "in", 10_000, meta={"cost": 6_000}, at=on(2025, 2, 3)),
        entry("apr", "product_sale", "in", 30_000, meta={"cost": 12_000}, at=on(2025, 4, 28)),
        entry("may", "product_sale", "in", 40_000, meta={"cost": 40_000}, at=on(2025, 5, 2)),    # same month: ignored
    ]
    sale = entry("s1", "product_sale", "in", 1_000, at=on(2025, 5, 10))
    # February to April: cost 18,000 of sales 40,000 = 45%.
    assert estimated_costs(history + [sale])["s1"] == 450


def test_khr_sales_count_in_dollars():
    khr = entry("k1", "product_sale", "in", 400_000, meta={"cost": 300_000}, at=on(2025, 4, 1), currency="KHR")
    usd = entry("u1", "product_sale", "in", 10_000, meta={"cost": 5_000}, at=on(2025, 4, 2))
    sale = entry("s1", "product_sale", "in", 1_000, at=on(2025, 5, 10))
    # $100 at 75% and $100 at 50%: 62.5%.
    assert estimated_costs([khr, usd, sale])["s1"] == 625


def test_reversed_sales_do_not_count_and_a_reversal_mirrors_the_estimate():
    wrong = entry("w1", "product_sale", "in", 10_000, meta={"cost": 9_000}, at=on(2025, 4, 1))
    sale = entry("s1", "product_sale", "in", 10_000, at=on(2025, 5, 10))
    rows = [wrong, reversal_of("x1", wrong) | {"occurredAt": on(2025, 4, 2)}, sale]
    assert estimated_costs(rows)["s1"] == 6_700  # the only entered cost was reversed: benchmark
    undo = reversal_of("x2", sale) | {"occurredAt": on(2025, 9, 1)}
    with_history = [entry("aug", "product_sale", "in", 10_000, meta={"cost": 1_000}, at=on(2025, 8, 1)), *rows, undo]
    assert cost_lines(undo, with_history) == [("credit", "5000", 6_700), ("debit", "1200", 6_700)]


def test_an_estimate_does_not_change_as_time_passes():
    sale = entry("s1", "product_sale", "in", 10_000, at=on(2025, 5, 10))
    later = entry("jun", "product_sale", "in", 10_000, meta={"cost": 2_000}, at=on(2025, 6, 1))
    assert estimated_costs([sale, later])["s1"] == estimated_costs([sale])["s1"] == 6_700
