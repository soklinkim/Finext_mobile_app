"""Second reading of a statement PDF: money placed in its column by right-edge alignment with the column heading.

`statement_reader` finds column edges from vertical whitespace. On some layouts (ABA's among them) long descriptions run
right up to the Money In amounts, there is no whitespace between those columns, and every amount slides one column
over: Money In lands in the description, Money Out is read as money in and the balance as money out. Bank statements
right-align their money, so the right edge of each amount (or of the currency code printed after it) sits exactly
under the right edge of its heading. This reading uses that instead.

It reuses the reader's own building blocks (words, lines, header detection, date and amount parsing, checks) and
leaves `statement_reader.py` untouched. `statement_import` runs it only when the first reading fails its own
arithmetic checks, and keeps it only when it passes more of them.
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional, Tuple

from app import statement_reader as reader

MONEY_COLUMNS = ("debit", "credit", "balance", "amount")
# How far (in PDF points) an amount's right edge may sit from its heading's right edge.
ALIGN_TOLERANCE = 4.0
# A currency code printed after an amount ("6,000.00 KHR") belongs to it when it follows this closely.
CURRENCY_GAP = 6.0
CURRENCY_CODES = {"KHR": "KHR", "USD": "USD", "$": "USD", "៛": "KHR", "RIEL": "KHR"}


class _Layout:
    """Where one page's columns are: the money columns' right edges and where the description starts."""

    def __init__(self, header: reader.HeaderInfo):
        self.money: Dict[str, float] = {}
        self.description_x0: Optional[float] = None
        for name, first, last in header.ordered:
            if name in MONEY_COLUMNS:
                self.money[name] = last.x1
            elif name == "description":
                self.description_x0 = first.x0
        if self.description_x0 is None:
            date = next((first for name, first, _ in header.ordered if name == "date"), None)
            self.description_x0 = (date.x1 + 8.0) if date else 0.0
        self.top = header.line.bottom

    def usable(self) -> bool:
        return bool(self.money) and ({"debit", "credit"} <= set(self.money) or "amount" in self.money)

    def column_for(self, right: float) -> Optional[str]:
        best = min(self.money.items(), key=lambda item: abs(item[1] - right), default=None)
        return best[0] if best and abs(best[1] - right) <= ALIGN_TOLERANCE else None


def _claim_money(line: reader.TextLine, layout: _Layout) -> Tuple[Dict[str, float], Optional[str], set]:
    """Amounts on this line that line up under a money heading, the currency printed with them, and the claimed words."""
    found: Dict[str, float] = {}
    currency: Optional[str] = None
    claimed: set = set()
    words = line.words
    for i, word in enumerate(words):
        value = reader.parse_amount(word.text)
        if value is None or not any(ch.isdigit() for ch in word.text):
            continue
        right, code_index = word.x1, None
        nxt = words[i + 1] if i + 1 < len(words) else None
        if nxt is not None and nxt.text.upper() in CURRENCY_CODES and nxt.x0 - word.x1 <= CURRENCY_GAP:
            right, code_index = nxt.x1, i + 1
        column = layout.column_for(right)
        if column is None or column in found:
            continue
        # One signed "Amount" column keeps its sign (the reader turns it into in / out); the others are sizes.
        found[column] = value if column == "amount" else abs(value)
        claimed.add(i)
        if code_index is not None:
            claimed.add(code_index)
            currency = CURRENCY_CODES[words[code_index].text.upper()]
    return found, currency, claimed


def extract(path: Path, dayfirst: bool = True, password: Optional[str] = None) -> Optional[reader.Result]:
    """Read the statement by column alignment. None when the layout does not suit it (no usable heading row)."""
    result = reader.Result(source=path)
    kwargs = {"password": password} if password else {}
    pages_text: List[str] = []
    rows: List[reader.Transaction] = []
    layout: Optional[_Layout] = None

    with reader.pdfplumber.open(str(path), **kwargs) as pdf:
        result.pages = len(pdf.pages)
        for page_no, page in enumerate(pdf.pages, start=1):
            words = reader.page_words(page)
            if not words:
                continue
            lines = reader.group_lines(words)
            pages_text.append("\n".join(line.text for line in lines))
            header = reader.find_header(lines)
            start = 0
            if header is not None:
                found = _Layout(header)
                if found.usable():
                    layout, start = found, header.index + 1
            if layout is None:
                continue

            current: Optional[reader.Transaction] = None  # the row whose wrapped description lines are still coming
            for line in lines[start:]:
                text = line.text
                date_words = [w for w in line.words if w.x1 < layout.description_x0 - 1.0]
                date = reader.parse_date(" ".join(w.text for w in date_words), dayfirst=dayfirst) if date_words else None
                if date is None and date_words:
                    # Something in the date column that is not a date: a total, an ending balance, a page footer.
                    current = None
                    continue
                if reader.is_footer(text):
                    current = None
                    continue
                money, currency, claimed = _claim_money(line, layout)
                rest = " ".join(w.text for i, w in enumerate(line.words) if i not in claimed and w not in date_words)
                if date is not None:
                    current = reader.Transaction(date=date, description=rest.strip(), page=page_no, currency=currency)
                    current.debit, current.credit = money.get("debit"), money.get("credit")
                    current.balance, current.amount = money.get("balance"), money.get("amount")
                    rows.append(current)
                elif current is not None:
                    if rest.strip():
                        current.description = f"{current.description} {rest.strip()}".strip()
                    for name, value in money.items():  # amounts printed on a wrapped line still belong to the row
                        if getattr(current, name) is None:
                            setattr(current, name, value)

    if not rows:
        return None
    result.meta = reader.read_metadata(pages_text)
    for row in rows:
        row.currency = row.currency or result.meta.currency
    result.rows = reader.normalise_columns(rows, result.notes)
    result.checks = reader.run_checks(rows, result.meta)
    result.notes.append("Columns read by aligning each amount with its heading.")
    return result
