"""Bank statement import: a statement PDF read into rows the owner reviews before anything is saved.

The reading is done by `statement_reader.py`, a copy of Saron Borak's standalone statement_to_excel tool (kept
unchanged so updates can be dropped in). This module only runs it on an uploaded file and shapes the result for the app: one row
per transaction (money in or out, never both), what the statement says about itself, and its own arithmetic checks.

The PDF is written to a temporary file because the reader opens files by path, and deleted straight after. Nothing
from the statement is stored: the app turns the rows the owner confirms into ordinary entries.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

from app import statement_reader as reader

MAX_BYTES = 10 * 1024 * 1024
CURRENCIES = {"USD", "KHR"}  # what FINEXT books in


class StatementError(ValueError):
    """A problem the owner can act on; `code` lets the app say it in their language."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _currency(code: str | None) -> str | None:
    return code if code in CURRENCIES else None


def _masked(number: str | None) -> str | None:
    """Only the last four digits: enough for the owner to recognise the account."""
    digits = "".join(ch for ch in number or "" if ch.isdigit())
    return f"•••• {digits[-4:]}" if len(digits) >= 4 else None


def read_statement(content: bytes, password: str | None = None) -> dict:
    """Read a statement PDF. Raises StatementError for files that cannot be read as a statement."""
    if len(content) > MAX_BYTES:
        raise StatementError("too_large", "The file is larger than 10 MB.")
    if not content.startswith(b"%PDF"):
        raise StatementError("not_pdf", "This file is not a PDF.")

    handle, name = tempfile.mkstemp(suffix=".pdf")
    try:
        with os.fdopen(handle, "wb") as f:
            f.write(content)
        path = Path(name)
        try:
            # OCR needs Tesseract on the server, which is not installed: scans are reported instead.
            result = reader.extract_pdf(path, dayfirst=True, ocr_mode="off", password=password or None)
        except Exception as exc:
            if reader.is_encrypted(path):
                raise StatementError("wrong_password" if password else "password", "This PDF is password protected.") from exc
            raise StatementError("unreadable", "This PDF could not be read.") from exc
    finally:
        os.unlink(name)

    if not result.rows:
        raise StatementError("no_table", "No transaction table was found. If this is a scanned statement, "
                                         "export the PDF from your bank's app or website instead.")
    meta = result.meta
    rows = []
    for index, row in enumerate(result.rows):
        money_out, money_in = abs(row.debit or 0.0), abs(row.credit or 0.0)
        if money_out == money_in:  # no movement (an opening balance line) or a row read both ways
            continue
        rows.append({
            "index": index,
            "date": row.date.isoformat() if row.date else None,
            "description": row.description,
            "direction": "out" if money_out > money_in else "in",
            "amount": round(abs(money_out - money_in), 2),
            "balance": row.balance,
            "currency": _currency(row.currency) or _currency(meta.currency),
        })
    return {
        "bank": meta.bank,
        "account": _masked(meta.account_number),
        "period": meta.period,
        "currency": _currency(meta.currency),
        "openingBalance": meta.opening_balance,
        "closingBalance": meta.closing_balance,
        "pages": result.pages,
        "rows": [row for row in rows if row["date"]],
        "checks": [{"name": c.name, "passed": c.passed, "detail": c.detail} for c in result.checks],
        "notes": result.notes,
    }
