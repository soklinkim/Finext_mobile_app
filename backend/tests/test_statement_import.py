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


def sample_statement(rows=ROWS, closing="1,350.00") -> bytes:
    lines = [(40, 800, "ACLEDA BANK PLC."), (40, 785, "Account Number : 0001-12345678"), (40, 770, "Currency : USD"),
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
