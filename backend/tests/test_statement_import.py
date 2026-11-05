"""Bank statement import: an uploaded PDF read into reviewable rows, with the statement's own checks.

The statements here are built by `statement_pdf()`, a minimal PDF writer, so the tests need no files and no real
customer data. They are test fixtures only.
"""
import pytest
from fastapi.testclient import TestClient

from app.auth import current_user
from app.main import app
from app.statement_import import StatementError, read_statement


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def statement_pdf(lines: list[tuple[float, float, str]]) -> bytes:
    """One A4 page of Helvetica text, each line placed at (x, y) points from the bottom left."""
    stream = "\n".join(f"BT /F1 9 Tf {x} {y} Td ({_escape(text)}) Tj ET" for x, y, text in lines).encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % offset for offset in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


ROWS = [  # date, description, debit, credit, balance
    ("01/03/2026", "Customer payment Sokha", "", "500.00", "1,500.00"),
    ("05/03/2026", "Shop rent March", "400.00", "", "1,100.00"),
    ("10/03/2026", "EDC electricity", "50.00", "", "1,050.00"),
    ("15/03/2026", "QR sales", "", "300.00", "1,350.00"),
]


def sample_statement(rows=ROWS, closing="1,350.00", bank="ACLEDA BANK PLC.") -> bytes:
    lines = [(40, 800, bank), (40, 785, "Account Number : 0001-12345678"), (40, 770, "Currency : USD"),
             (40, 755, f"Closing Balance : {closing}"),
             (40, 720, "Date"), (120, 720, "Description"), (330, 720, "Debit"), (410, 720, "Credit"), (490, 720, "Balance")]
    for i, (date, description, debit, credit, balance) in enumerate(rows):
        y = 700 - i * 16
        lines += [(40, y, date), (120, y, description), (490, y, balance)]
        lines += [(330, y, debit)] if debit else []
        lines += [(410, y, credit)] if credit else []
    return statement_pdf(lines)


def test_rows_come_back_as_money_in_or_out_with_the_statement_details():
    result = read_statement(sample_statement())
    assert result["bank"] == "ACLEDA Bank" and result["currency"] == "USD"
    assert result["account"] == "•••• 5678"  # never the full account number
    assert [(r["date"], r["direction"], r["amount"]) for r in result["rows"]] == [
        ("2026-03-01", "in", 500.0), ("2026-03-05", "out", 400.0), ("2026-03-10", "out", 50.0), ("2026-03-15", "in", 300.0)]
    assert result["rows"][1]["description"] == "Shop rent March" and result["rows"][1]["currency"] == "USD"
    checks = {c["name"]: c["passed"] for c in result["checks"]}
    assert checks["Running balance adds up"] and checks["Final balance matches statement"]


def test_kb_prasac_statements_are_named_without_changing_the_reader():
    from app import statement_reader
    result = read_statement(sample_statement(bank="KB PRASAC Bank Plc."))
    assert result["bank"] == "KB PRASAC Bank" and len(result["rows"]) == 4
    assert sum(bank == "KB PRASAC Bank" for bank, _ in statement_reader.BANK_SIGNATURES) == 1  # added once


def test_a_statement_that_does_not_name_its_bank_is_not_given_one():
    # The reader guesses a bank from the file name as a last resort; random temporary names once read as banks
    # ("tmpj3kx8q.pdf" -> J Trust Royal) for about one upload in five.
    for _ in range(20):
        assert read_statement(sample_statement(bank="SAMPLE BANK PLC."))["bank"] is None


def test_a_statement_that_does_not_add_up_says_so():
    rows = [*ROWS[:3], ("15/03/2026", "QR sales", "", "300.00", "1,950.00")]  # balance jumps by 900, not 300
    checks = {c["name"]: c["passed"] for c in read_statement(sample_statement(rows, closing="1,950.00"))["checks"]}
    assert checks["Running balance adds up"] is False


@pytest.mark.parametrize("content, code", [
    (b"hello", "not_pdf"),
    (statement_pdf([(40, 800, "Thank you for banking with us.")]), "no_table"),
])
def test_files_that_are_not_statements_are_refused_with_a_reason(content, code):
    with pytest.raises(StatementError) as error:
        read_statement(content)
    assert error.value.code == code


def test_import_endpoint():
    app.dependency_overrides[current_user] = lambda: "sme"
    try:
        client = TestClient(app)
        ok = client.post("/import/statement", files={"file": ("statement.pdf", sample_statement(), "application/pdf")})
        assert ok.status_code == 200 and len(ok.json()["rows"]) == 4
        bad = client.post("/import/statement", files={"file": ("notes.txt", b"hello", "text/plain")})
        assert bad.status_code == 415 and bad.json()["detail"]["code"] == "not_pdf"
    finally:
        app.dependency_overrides.clear()


# ABA-style layout: every amount right-aligned under its heading with the currency after it ("6,000.00 KHR"), a
# "0.00 KHR" in the column not used, and descriptions running up to the Money In column, so there is no whitespace
# between them. Widths are Helvetica's (1/1000 em), so the text lines up exactly as in the bank's own PDF.
_HELVETICA = {**{d: 556 for d in "0123456789"}, ",": 278, ".": 278, " ": 278, "K": 667, "H": 722, "R": 722,
              "M": 833, "o": 556, "n": 556, "e": 556, "y": 500, "I": 278, "O": 778, "u": 556, "t": 278,
              "B": 667, "a": 556, "l": 222, "c": 500}


def _right(x_right: float, text: str) -> float:
    return x_right - sum(_HELVETICA[c] for c in text) * 9 / 1000


def aba_statement(rows) -> bytes:
    lines = [(50, 800, "ABA BANK"), (50, 785, "Account No. 000123456"), (50, 770, "Account Currency KHR"),
             (320, 755, "Opening Balance"), (480, 755, "37.81 KHR"), (320, 740, "Ending Balance"), (480, 740, "83.32 KHR"),
             (50, 700, "Date"), (120, 700, "Transaction Details"), (_right(370, "Money In"), 700, "Money In"),
             (_right(445, "Money Out"), 700, "Money Out"), (_right(545, "Balance"), 700, "Balance")]
    y = 676
    for date, details, wrapped, money_in, money_out, balance in rows:
        lines += [(50, y, date), (120, y, details)]
        lines += [(_right(edge, f"{amount} KHR"), y, f"{amount} KHR")
                  for edge, amount in ((370, money_in), (445, money_out), (545, balance))]
        lines += [(120, y - 12, wrapped)]
        y -= 48
    return statement_pdf(lines)


ABA_ROWS = [  # date, details, wrapped line (with its own "ORIGINAL AMOUNT" figure), money in, money out, balance
    ("May 21, 2026", "FUNDS RECEIVED FROM ROS MONA (016", "390) ORIGINAL AMOUNT 6,000.00 KHR", "6,000.00", "0.00", "6,037.81"),
    ("Jul 24, 2026", "FUNDS RECEIVED FROM LONG RITH", "962 432) ORIGINAL AMOUNT 17,000.00 KHR", "17,000.00", "0.00", "23,037.81"),
    ("Jul 24, 2026", "PURCHASE AT Grab ON Jul 24, 2026 12:54 PM", "ORIGINAL AMOUNT 20,800.00 KHR", "0.00", "20,800.00", "2,237.81"),
    ("Jul 26, 2026", "PAYMENT FROM CHEAB BUN EANG", "BANK ACLEDA ORIGINAL AMOUNT 80,000.00 KHR", "80,000.00", "0.00", "82,237.81"),
    ("Jul 26, 2026", "FUNDS TRANSFERRED TO LONG MONU CHENDR", "ORIGINAL AMOUNT 82,154.49 KHR", "0.00", "82,154.49", "83.32"),
]


def test_aba_layout_reads_money_in_and_out_from_the_right_columns():
    result = read_statement(aba_statement(ABA_ROWS))
    assert [(row["direction"], row["amount"]) for row in result["rows"]] == [
        ("in", 6000.0), ("in", 17000.0), ("out", 20800.0), ("in", 80000.0), ("out", 82154.49)]
    assert [row["balance"] for row in result["rows"]] == [6037.81, 23037.81, 2237.81, 82237.81, 83.32]
    # The "ORIGINAL AMOUNT" inside the description is text, not a second amount.
    assert "ORIGINAL AMOUNT 6,000.00 KHR" in result["rows"][0]["description"]
    assert result["currency"] == "KHR"
    assert all(check["passed"] for check in result["checks"])
    # The three figures the import is about. This statement prints no totals, so they are what the rows add up to.
    assert (result["totalIn"], result["totalOut"]) == (103000.0, 102954.49)
    assert (result["openingBalance"], result["closingBalance"]) == (37.81, 83.32)


def test_ending_balance_falls_back_to_the_last_running_balance():
    lines = [(40, 800, "ACLEDA BANK PLC."), (40, 770, "Currency : USD"),
             (40, 720, "Date"), (120, 720, "Description"), (330, 720, "Debit"), (410, 720, "Credit"), (490, 720, "Balance")]
    for i, (date, description, debit, credit, balance) in enumerate(ROWS):
        y = 700 - i * 16
        lines += [(40, y, date), (120, y, description), (490, y, balance)]
        lines += [(330, y, debit)] if debit else []
        lines += [(410, y, credit)] if credit else []
    result = read_statement(statement_pdf(lines))  # no "Closing Balance" line printed
    assert result["closingBalance"] == 1350.0
    assert (result["totalIn"], result["totalOut"]) == (800.0, 450.0)
