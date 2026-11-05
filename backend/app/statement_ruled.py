"""Third reading of a statement PDF: a table drawn with ruled lines whose heading row is a picture, not text.

`statement_reader` finds the columns from the printed headings (Date, Description, Debit, Credit, Balance). Some banks
(Wing Bank's statements among them) draw that heading row as an image or as outlined shapes: there is no text to find,
so the reader sees no table at all and reports "No transaction table was found". The table itself is still drawn with
ruled lines, and those lines give the columns and the rows.

This reading uses the lines instead:
- the columns are the vertical rules that repeat on the pages of the document;
- a row ends at a horizontal rule, and starts with a date in the first column;
- the last three columns are Debit, Credit and Balance, the first is the date, and the description is the widest
  of the columns in between.

It reuses the reader's own building blocks (words, date and amount parsing, metadata, checks) and leaves
`statement_reader.py` untouched. `statement_import` runs it only when the first reading found no rows or failed its own
arithmetic checks, and keeps it only when it passes more of them.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import List, Optional

from app import statement_reader as reader

MIN_COLUMNS = 5        # date, description, debit, credit, balance
MERGE = 2.0            # rules closer than this (in PDF points) are the same rule
MIN_RULE_LENGTH = 20.0  # shorter strokes are not table rules


def _merge(values: List[float]) -> List[float]:
    out: List[float] = []
    for value in sorted(values):
        if out and value - out[-1] <= MERGE:
            continue
        out.append(value)
    return out


def _rules(page) -> tuple[List[float], List[float]]:
    """x positions of the vertical rules and y positions of the horizontal ones on a page."""
    vertical = [e["x0"] for e in page.edges if e["orientation"] == "v" and e["bottom"] - e["top"] >= MIN_RULE_LENGTH]
    horizontal = [e["top"] for e in page.edges if e["orientation"] == "h" and e["x1"] - e["x0"] >= MIN_RULE_LENGTH]
    return _merge(vertical), _merge(horizontal)


def _column_edges(per_page: List[List[float]]) -> Optional[List[float]]:
    """The vertical rules that the pages of the document share: the table's columns."""
    pages = [p for p in per_page if len(p) >= MIN_COLUMNS + 1]
    if not pages:
        return None
    seen: Counter = Counter()
    for xs in pages:
        for x in {round(x) for x in xs}:
            seen[x] += 1
    need = 2 if len(pages) >= 2 else 1
    # A rule a point or two off on another page still counts as the same rule.
    shared = _merge([float(x) for x, n in seen.items() if n >= need])
    return shared if len(shared) >= MIN_COLUMNS + 1 else None


def extract(path: Path, dayfirst: bool = True, password: Optional[str] = None) -> Optional[reader.Result]:
    """Read the statement from its ruled table. None when the PDF has no such table."""
    result = reader.Result(source=path)
    kwargs = {"password": password} if password else {}
    pages_text: List[str] = []
    rows: List[reader.Transaction] = []
    outside: List[str] = []  # words that are not part of a transaction row: headings, account details, footers

    with reader.pdfplumber.open(str(path), **kwargs) as pdf:
        result.pages = len(pdf.pages)
        rules = [_rules(page) for page in pdf.pages]
        edges = _column_edges([r[0] for r in rules])
        if edges is None:
            return None
        cells = list(zip(edges[:-1], edges[1:]))
        widths = [right - left for left, right in cells]
        middle = range(1, len(cells) - 3)
        description_at = max(middle, key=lambda i: widths[i]) if len(list(middle)) else 1

        for page_no, page in enumerate(pdf.pages, start=1):
            words = reader.page_words(page)
            if not words:
                continue
            pages_text.append("\n".join(line.text for line in reader.group_lines(words)))
            ys = rules[page_no - 1][1]
            if not ys:
                continue
            # Words inside the table's columns, grouped by the first horizontal rule below them.
            groups: dict = {}
            for word in words:
                centre_x, centre_y = (word.x0 + word.x1) / 2, (word.top + word.bottom) / 2
                if not edges[0] <= centre_x <= edges[-1]:
                    continue
                below = next((y for y in ys if y >= centre_y), None)
                if below is None:  # under the last rule: footer text
                    continue
                groups.setdefault(below, []).append(word)
            used: set = set()
            for below in sorted(groups):
                cell: dict[int, List] = {}
                for word in groups[below]:
                    centre_x = (word.x0 + word.x1) / 2
                    index = next((i for i, (left, right) in enumerate(cells) if left <= centre_x <= right), None)
                    if index is not None:
                        cell.setdefault(index, []).append(word)
                first = sorted(cell.get(0, []), key=lambda w: (round(w.top), w.x0))
                date = reader.parse_date(first[0].text, dayfirst=dayfirst) if first else None
                if date is None:  # not a transaction row: the account details above the table, a total
                    continue
                text = lambda i: " ".join(w.text for w in sorted(cell.get(i, []), key=lambda w: (round(w.top), w.x0))).strip()  # noqa: E731
                n = len(cells)
                money = [reader.parse_amount(text(i)) for i in (n - 3, n - 2, n - 1)]
                row = reader.Transaction(date=date, description=text(description_at), page=page_no)
                row.debit = abs(money[0]) if money[0] is not None else None
                row.credit = abs(money[1]) if money[1] is not None else None
                row.balance = money[2]
                rows.append(row)
                used.update(id(w) for w in groups[below])
            outside.extend(w.text for w in words if id(w) not in used)

    if not rows:
        return None
    result.meta = reader.read_metadata(pages_text)
    # The reader names the bank from the first signature found anywhere in the text, and a transfer description such as
    # "... ABA Bank" would win over the statement's own letterhead. Look outside the transactions first.
    around = " ".join(outside).lower()
    bank = next((name for name, needles in reader.BANK_SIGNATURES if any(n in around for n in needles)), None)
    if bank:
        result.meta.bank = bank
    for row in rows:
        row.currency = row.currency or result.meta.currency
    result.rows = reader.normalise_columns(rows, result.notes)
    result.checks = reader.run_checks(rows, result.meta)
    result.notes.append("Columns read from the table's ruled lines (the heading row is not text).")
    return result
