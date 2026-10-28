#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
statement_to_excel.py -- Bank statement PDF -> clean Excel table.

Author: Saron Borak. Used in FINEXT unchanged behind the bank statement import.

Point it at a statement PDF and it produces a tidy spreadsheet:

    Date | Description | Debit | Credit | Balance | Currency | Page

It works the layout out by itself. There is nothing to click and no
coordinates to draw: the transaction table is located by reading the
statement's own column headings, in English or Khmer, and the column
edges are measured from the vertical whitespace that separates them.
That makes it work across banks (ACLEDA, ABA, Wing, Canadia, Sathapana,
Vattanac, Maybank, ...) instead of one bank at a time.

Usage
-----
    python statement_to_excel.py                     # pick a file, guided
    python statement_to_excel.py statement.pdf       # straight to work
    python statement_to_excel.py a.pdf b.pdf -o out.xlsx
    python statement_to_excel.py folder/ --separate  # one book per file

Useful flags: --ocr auto|off|force, --password, --report, --csv, --no-open.
Run with --help for the full list.

Install
-------
    pip install pdfplumber openpyxl python-dateutil
    # only for scanned (image) statements:
    pip install pytesseract pillow        # plus the Tesseract binary + khm data

Why it is built this way
------------------------
Statement PDFs are generated, not drawn by hand, so each column sits at a
fixed x-range on every page. Three things trip up naive extraction, and each
gets a dedicated pass here:

1. Fake bold. Many statements (ACLEDA among them) embolden text by painting
   it twice, a third of a point apart. Read naively, "ACCOUNT" comes back as
   "AACCCCOOUUNNTT" and "5,797,423.00" as "55,,779977,,442233..0000".
   dedupe_overprint() drops the second impression before anything else runs.

2. Right-aligned money. An amount's left edge says nothing about which
   column it belongs to -- "2,000,000.00" can begin to the left of its own
   heading. Column boundaries therefore come from whitespace corridors
   (x-ranges no glyph ever touches), not from heading edges.

3. Wrapped rows. One transaction spans several lines, with the date printed
   only on the first. A line starts a new transaction only when its date cell
   holds a date; every other line folds into the description above it.

The result is then checked against itself: the running balance must agree
row to row, and the totals the statement prints about itself must agree with
the rows extracted. If debit and credit turn out to be the wrong way round,
the arithmetic says so and they are swapped automatically.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import glob
import logging
import os
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

__version__ = "2.0"

# pdfminer is chatty about fonts it cannot fully parse; the text still comes
# through, so keep the console clean.
logging.getLogger("pdfminer").setLevel(logging.ERROR)
logging.getLogger("pdfplumber").setLevel(logging.ERROR)


# --------------------------------------------------------------------------
# Dependencies
# --------------------------------------------------------------------------

try:
    import pdfplumber
    from pdfplumber.utils import extract_words as _pdf_extract_words
except Exception:  # pragma: no cover - import guard
    pdfplumber = None
    _pdf_extract_words = None

try:
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
except Exception:  # pragma: no cover - import guard
    openpyxl = None

try:
    from dateutil import parser as _dateutil_parser
except Exception:  # pragma: no cover - import guard
    _dateutil_parser = None


def require_dependencies() -> None:
    """Fail early, with the exact pip line to run."""
    missing = []
    if pdfplumber is None:
        missing.append("pdfplumber")
    if openpyxl is None:
        missing.append("openpyxl")
    if missing:
        print("Cannot start -- required packages are not installed:\n")
        for name in missing:
            print("  - " + name)
        print("\nInstall everything with:\n")
        print("  pip install pdfplumber openpyxl python-dateutil\n")
        sys.exit(2)


# --------------------------------------------------------------------------
# Language data: Khmer and English
# --------------------------------------------------------------------------

#: Khmer digits U+17E0..U+17E9 -> ASCII.
KHMER_DIGITS = {c: str(i) for i, c in enumerate("០១២៣៤៥៦៧៨៩")}

#: Month name -> month number, English and Khmer.
MONTHS: Dict[str, int] = {}
for _i, _names in enumerate(
    [
        ("january", "jan", "មករា"),
        ("february", "feb", "កុម្ភៈ", "កុម្ភះ"),
        ("march", "mar", "មីនា"),
        ("april", "apr", "មេសា"),
        ("may", "ឧសភា"),
        ("june", "jun", "មិថុនា"),
        ("july", "jul", "កក្កដា"),
        ("august", "aug", "សីហា"),
        ("september", "sep", "sept", "កញ្ញា"),
        ("october", "oct", "តុលា"),
        ("november", "nov", "វិច្ឆិកា"),
        ("december", "dec", "ធ្នូ"),
    ],
    start=1,
):
    for _n in _names:
        MONTHS[_n] = _i

#: Currency tokens that may sit beside an amount and must not become one.
CURRENCY_TOKENS = {
    "khr", "usd", "eur", "gbp", "thb", "jpy", "cny", "sgd", "vnd", "aud",
    "riel", "រៀល", "ដុល្លារ", "៛", "$", "€", "£", "¥", "฿",
}

#: Column headings per logical field, folded for comparison.
COLUMN_ALIASES: Dict[str, Sequence[str]] = {
    "date": (
        "date", "trxdate", "trndate", "transactiondate", "valuedate",
        "postingdate", "postdate", "effectivedate", "datetime",
        "ថ្ងៃ", "ថ្ងៃទី", "កាលបរិច្ឆេទ", "ថ្ងៃខែឆ្នាំ",
    ),
    "description": (
        "description", "descriptions", "particulars", "narrative", "details",
        "transactiondetails", "remark", "remarks", "memo", "narration",
        "detail", "transaction", "reference",
        "បរិយាយ", "ការពិពណ៌នា", "ពិពណ៌នា", "សេចក្ដីលម្អិត", "សេចក្តីលម្អិត",
        "ប្រតិបត្តិការ", "កំណត់សម្គាល់",
    ),
    "debit": (
        "debit", "dr", "cashout", "cashoutdr", "withdrawal", "withdrawals",
        "paidout", "moneyout", "outflow", "debitamount",
        "ឥណពន្ធ", "ប្រាក់ចេញ", "ប្រាក់ដក", "ដក", "ចេញ",
    ),
    "credit": (
        "credit", "cr", "cashin", "cashincr", "deposit", "deposits",
        "paidin", "moneyin", "inflow", "creditamount",
        "ឥណទាន", "ប្រាក់ចូល", "ប្រាក់បញ្ញើ", "បញ្ចូល", "ចូល",
    ),
    "balance": (
        "balance", "runningbalance", "closingbalance", "availablebalance",
        "balanceamount", "bal", "ledgerbalance",
        "សមតុល្យ", "សមតុល្យនៅសល់", "សល់",
    ),
    "amount": (
        "amount", "transactionamount", "amt", "value",
        "ចំនួនទឹកប្រាក់", "ចំនួន", "ទឹកប្រាក់",
    ),
    "currency": ("currency", "ccy", "cur", "រូបិយប័ណ្ណ"),
    "drcr": ("drcr", "crdr", "type", "indicator", "ប្រភេទ"),
}

#: Fields that hold money.
MONEY_FIELDS = ("debit", "credit", "balance", "amount")

#: Banks recognised from statement text, for labelling the report only.
#: Detection never changes how extraction works -- the engine is layout driven.
BANK_SIGNATURES: Sequence[Tuple[str, Sequence[str]]] = (
    ("ACLEDA Bank", ("acleda", "aclbkhpp", "អេស៊ីលីដា")),
    ("ABA Bank", ("aba bank", "advanced bank of asia", "abaakhpp")),
    ("Wing Bank", ("wing bank", "wing (cambodia)", "wibakhpp", "វីង")),
    ("Canadia Bank", ("canadia", "cadikhpp", "កាណាឌីយ៉ា")),
    ("Sathapana Bank", ("sathapana", "mhcbkhpp", "ស្ថាបនា")),
    ("Vattanac Bank", ("vattanac", "vbbakhpp", "វឌ្ឍនៈ")),
    ("Maybank", ("maybank", "mbbekhpp")),
    ("Phillip Bank", ("phillip bank", "kwdbkhpp")),
    ("PPCBank", ("ppcbank", "phnom penh commercial", "pppckhpp")),
    ("Prince Bank", ("prince bank", "prctkhpp")),
    ("Chip Mong Bank", ("chip mong", "cmcbkhpp")),
    ("Hattha Bank", ("hattha", "hkslkhpp")),
    ("AMK", ("amk microfinance", "amk plc")),
    ("Amret", ("amret",)),
    ("FTB", ("foreign trade bank", "fntlkhpp")),
    ("J Trust Royal", ("j trust royal", "anzrkhpp")),
    ("Bakong / NBC", ("bakong", "national bank of cambodia")),
)

#: Lines matching these are page furniture, never transactions.
FOOTER_PATTERNS = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"^\s*page\s*[:.]?\s*\d+\s*(of|/)\s*\d+",
        r"\bpage\s*[:.]?\s*\d+\s*(of|/)\s*\d+\b",
        r"^\s*(continued|cont'd|carried forward|brought forward)\b",
        r"^\s*(end of statement|end of report)\b",
        r"ទំព័រ\s*[:.]?\s*\d+",
        r"^\s*\d+\s*/\s*\d+\s*$",
    )
)

#: Lines matching these are summary/total rows, kept out of the ledger.
TOTAL_PATTERNS = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"^\s*(total|totals|grand total|sub-?total)\b",
        r"^\s*net\s+(movement|change)\b",
        r"^\s*(opening|closing|ending|beginning|previous|brought)\s+balance\b",
        r"^\s*balance\s+(b/?f|c/?f|forward|carried)\b",
        r"^\s*សរុប\b",
    )
)


# --------------------------------------------------------------------------
# Text normalisation
# --------------------------------------------------------------------------

_CID_RE = re.compile(r"\(cid:\d+\)")
_WS_RE = re.compile(r"[ \t ​]+")


def strip_cid(text: str) -> str:
    """Remove ``(cid:NN)`` placeholders left by fonts without a unicode map.

    These appear where a PDF embeds Khmer glyphs but no ToUnicode table, so
    the character simply is not recoverable from the text layer. Dropping the
    marker beats carrying it into a spreadsheet cell; ``--ocr force`` is the
    way to recover the actual characters.
    """
    return _CID_RE.sub("", text or "")


def normalize_text(text: str) -> str:
    """NFC-normalise, drop cid markers, collapse runs of spaces."""
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    text = strip_cid(text)
    text = text.replace("​", "").replace(" ", " ")
    return _WS_RE.sub(" ", text).strip()


def khmer_digits_to_ascii(text: str) -> str:
    """Rewrite ០-៩ as 0-9 so Khmer numerals parse like any other."""
    if not text:
        return text
    return "".join(KHMER_DIGITS.get(ch, ch) for ch in text)


def fold(text: str) -> str:
    """Fold a heading to a comparable key: lower-case alphanumerics only.

    Spaces, punctuation and case are discarded, so "CASH OUT (Dr)" and
    "cashoutdr" compare equal. Khmer combining marks are kept because they
    distinguish real words.
    """
    text = unicodedata.normalize("NFC", strip_cid(text)).lower()
    return "".join(ch for ch in text if ch.isalnum())


def undouble(text: str) -> str:
    """Collapse "AACCCCOOUUNNTT" to "ACCOUNT".

    A safety net for statements whose emboldening is baked into the text
    stream rather than painted twice. Applied only when the string really is
    a perfect pairwise doubling, so genuine repeats stay intact.
    """
    if len(text) < 4 or len(text) % 2:
        return text
    if all(text[i] == text[i + 1] for i in range(0, len(text), 2)):
        return text[::2]
    return text


def has_khmer(text: str) -> bool:
    return any("ក" <= ch <= "៿" for ch in text or "")


#: Month names keyed by their folded form, which is how they are looked up.
#: Built here rather than beside MONTHS because it needs :func:`fold`.
MONTHS_FOLDED: Dict[str, int] = {}
for _name, _num in MONTHS.items():
    _key = fold(_name)
    if _key:
        MONTHS_FOLDED.setdefault(_key, _num)


# --------------------------------------------------------------------------
# Value parsing
# --------------------------------------------------------------------------

#: One character of a month name. Deliberately defined by exclusion rather
#: than as ``[^\W\d_]``: Khmer month names carry combining vowel signs such as
#: U+17B6 in "មករា", and those are Unicode marks, which \w does not match.
#: Spelling the class as "not a digit, space or separator" keeps every script.
_NAME_CHAR = r"[^\d\s/\\.,;:|()\[\]<>+*=#$%&@!?\"'~`^_-]"

_DATE_NUMERIC = re.compile(
    r"(?<!\d)(\d{1,4})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})(?!\d)"
)
_DATE_MONTH_NAME = re.compile(
    r"(?<!\d)(\d{1,2})\s*[\-/.,]?\s*(" + _NAME_CHAR + r"{2,20})\s*[\-/.,]?\s*(\d{4})(?!\d)"
)
_DATE_NAME_FIRST = re.compile(
    r"(" + _NAME_CHAR + r"{3,20})\s*[\-/.,]?\s*(\d{1,2})\s*,?\s*(\d{4})(?!\d)"
)
_DATE_ISO = re.compile(r"(?<!\d)(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)")

#: A money token: optional sign/bracket, digits with separators, optional decimals.
_AMOUNT_RE = re.compile(
    r"""(?P<open>\()?\s*
        (?P<sign>[+-])?\s*
        (?P<cur>[\$€£¥฿៛])?\s*
        (?P<num>\d{1,3}(?:[, \s]\d{3})+(?:\.\d{1,4})?
               |\d{1,3}(?:\.\d{3})+(?:,\d{1,4})?
               |\d+(?:[.,]\d{1,4})?)
        \s*(?P<close>\))?""",
    re.VERBOSE,
)


def _month_from_name(token: str) -> Optional[int]:
    """Resolve a month name, English or Khmer, tolerating truncation.

    Comparison happens on folded keys, because folding is what makes a Khmer
    name printed with or without its combining marks compare equal.
    """
    key = fold(undouble(token))
    if not key:
        return None
    if key in MONTHS_FOLDED:
        return MONTHS_FOLDED[key]
    # Longest-prefix match handles "Sept", "Febr" and clipped Khmer forms.
    best: Optional[int] = None
    best_len = 0
    for name, num in MONTHS_FOLDED.items():
        if len(name) < 3:
            continue
        if key.startswith(name) or name.startswith(key):
            overlap = min(len(key), len(name))
            if overlap > best_len and overlap >= 3:
                best_len, best = overlap, num
    return best


def _build_date(year: int, month: int, day: int) -> Optional[_dt.date]:
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return None
    if year < 100:
        year += 2000 if year < 70 else 1900
    if not (1970 <= year <= _dt.date.today().year + 2):
        return None
    try:
        return _dt.date(year, month, day)
    except ValueError:
        return None


def parse_date(text: str, dayfirst: bool = True) -> Optional[_dt.date]:
    """Parse a statement date in English, Khmer or numeric form.

    Handles "Apr 01, 2025", "01 Apr 2025", "01 មេសា 2025", "2025-04-01",
    "01/04/2025" and Khmer numerals throughout. ``dayfirst`` decides
    ambiguous numeric dates such as 03/04/2025.
    """
    if not text:
        return None
    raw = khmer_digits_to_ascii(normalize_text(text))
    if not raw:
        return None

    m = _DATE_ISO.search(raw)
    if m:
        got = _build_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if got:
            return got

    m = _DATE_MONTH_NAME.search(raw)
    if m:
        month = _month_from_name(m.group(2))
        if month:
            got = _build_date(int(m.group(3)), month, int(m.group(1)))
            if got:
                return got

    m = _DATE_NAME_FIRST.search(raw)
    if m:
        month = _month_from_name(m.group(1))
        if month:
            got = _build_date(int(m.group(3)), month, int(m.group(2)))
            if got:
                return got

    m = _DATE_NUMERIC.search(raw)
    if m:
        a, b, c = (int(g) for g in m.groups())
        if len(m.group(1)) == 4:          # yyyy-mm-dd
            got = _build_date(a, b, c)
        elif dayfirst:
            got = _build_date(c, b, a) or _build_date(c, a, b)
        else:
            got = _build_date(c, a, b) or _build_date(c, b, a)
        if got:
            return got

    # Last resort, kept deliberately strict. dateutil fills anything it cannot
    # find from today's date, so a cell holding only "01" would come back as
    # the first of the current month and enter the sheet as a real
    # transaction. Requiring two numbers and refusing fuzzy matching keeps
    # that from happening.
    if _dateutil_parser is not None and len(re.findall(r"\d+", raw)) >= 2:
        try:
            parsed = _dateutil_parser.parse(raw, dayfirst=dayfirst, fuzzy=False)
            got = _build_date(parsed.year, parsed.month, parsed.day)
            if got:
                return got
        except Exception:
            pass
    return None


def parse_amount(text: str) -> Optional[float]:
    """Parse a money cell into a float.

    Understands 1,234.56 and 1.234,56, bracketed and trailing-minus
    negatives, a leading or trailing currency code or symbol, Khmer numerals,
    and the "Dr"/"Cr" suffix some banks print. Returns ``None`` for a cell
    that holds no number at all.
    """
    if text is None:
        return None
    raw = khmer_digits_to_ascii(normalize_text(text))
    if not raw:
        return None

    # A cell that is only a currency code carries no amount.
    if fold(raw) in {fold(c) for c in CURRENCY_TOKENS}:
        return None

    negative = False
    body = raw
    if body.endswith("-"):
        negative = True
        body = body[:-1].strip()
    if re.search(r"\bdr\b", body, re.IGNORECASE) and not re.search(r"\bcr\b", body, re.IGNORECASE):
        negative = True
    body = re.sub(r"\b(dr|cr)\b\.?", " ", body, flags=re.IGNORECASE)

    m = _AMOUNT_RE.search(body)
    if not m:
        return None
    if m.group("open") and m.group("close"):
        negative = True
    if m.group("sign") == "-":
        negative = True

    num = m.group("num")
    if "," in num and "." in num:
        # Whichever separator comes last is the decimal point.
        num = num.replace(",", "") if num.rfind(".") > num.rfind(",") else num.replace(".", "").replace(",", ".")
    elif num.count(",") == 1 and re.fullmatch(r"\d{1,3},\d{1,2}", num):
        num = num.replace(",", ".")          # 1,50 -> 1.50
    elif "," in num:
        num = num.replace(",", "")           # thousands separators
    elif num.count(".") > 1:
        num = num.replace(".", "")           # 1.234.567
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", num):
        num = num.replace(".", "")
    num = re.sub(r"[\s ]", "", num)

    try:
        value = float(num)
    except ValueError:
        return None
    return -value if negative else value


def detect_currency(text: str) -> Optional[str]:
    """Pull a currency code out of free text, if one is stated."""
    if not text:
        return None
    upper = khmer_digits_to_ascii(normalize_text(text)).upper()
    for code in ("KHR", "USD", "EUR", "GBP", "THB", "JPY", "CNY", "SGD", "VND", "AUD"):
        if re.search(r"\b" + code + r"\b", upper):
            return code
    if "៛" in upper or "រៀល" in text:
        return "KHR"
    if "$" in upper:
        return "USD"
    return None


# --------------------------------------------------------------------------
# Page geometry
# --------------------------------------------------------------------------

@dataclass
class Word:
    """A positioned token on the page."""
    text: str
    x0: float
    x1: float
    top: float
    bottom: float

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2.0

    @property
    def cy(self) -> float:
        return (self.top + self.bottom) / 2.0


@dataclass
class TextLine:
    """Words sharing a baseline, left to right."""
    words: List[Word]
    top: float
    bottom: float

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words).strip()

    @property
    def cy(self) -> float:
        return (self.top + self.bottom) / 2.0


def dedupe_overprint(chars: List[dict]) -> List[dict]:
    """Drop the second impression of text painted twice for fake bold.

    Two glyphs are the same impression when they are the same character on
    the same baseline and their left edges differ by less than a quarter of
    the glyph's width. A real repeat such as the "CC" in ACCOUNT sits a full
    glyph apart and survives.
    """
    if not chars:
        return chars
    buckets: Dict[Tuple[str, int], List[dict]] = {}
    for ch in chars:
        key = (ch.get("text", ""), int(round(ch.get("top", 0.0) * 2)))
        buckets.setdefault(key, []).append(ch)

    drop: set[int] = set()
    for group in buckets.values():
        if len(group) < 2:
            continue
        group.sort(key=lambda c: c["x0"])
        kept: List[dict] = []
        for ch in group:
            width = max(abs(ch.get("x1", 0.0) - ch.get("x0", 0.0)), 0.5)
            tol = max(0.15, min(1.2, width * 0.25))
            if any(abs(ch["x0"] - k["x0"]) <= tol for k in kept):
                drop.add(id(ch))
            else:
                kept.append(ch)
    if not drop:
        return chars
    return [ch for ch in chars if id(ch) not in drop]


def page_words(page: Any) -> List[Word]:
    """Clean words for one page: de-overprinted, NFC, cid markers removed."""
    chars = dedupe_overprint(list(page.chars))
    if not chars:
        return []
    raw = _pdf_extract_words(
        chars,
        x_tolerance=1.5,
        y_tolerance=2.0,
        keep_blank_chars=False,
        use_text_flow=False,
    )
    words: List[Word] = []
    for w in raw:
        text = normalize_text(w.get("text", ""))
        if not text:
            continue
        words.append(Word(text, float(w["x0"]), float(w["x1"]),
                          float(w["top"]), float(w["bottom"])))
    words.sort(key=lambda w: (w.top, w.x0))
    return words


def group_lines(words: Sequence[Word], tolerance: Optional[float] = None) -> List[TextLine]:
    """Group words into text lines by vertical overlap."""
    if not words:
        return []
    if tolerance is None:
        heights = sorted(w.bottom - w.top for w in words)
        median = heights[len(heights) // 2] or 8.0
        tolerance = max(2.0, median * 0.6)

    lines: List[TextLine] = []
    current: List[Word] = []
    anchor = None
    for w in sorted(words, key=lambda w: (w.cy, w.x0)):
        if current and anchor is not None and abs(w.cy - anchor) <= tolerance:
            current.append(w)
            anchor = sum(x.cy for x in current) / len(current)
        else:
            if current:
                lines.append(_finish_line(current))
            current = [w]
            anchor = w.cy
    if current:
        lines.append(_finish_line(current))
    lines.sort(key=lambda ln: ln.top)
    return lines


def _finish_line(words: List[Word]) -> TextLine:
    words.sort(key=lambda w: w.x0)
    return TextLine(words, min(w.top for w in words), max(w.bottom for w in words))


def whitespace_corridors(
    words: Sequence[Word], page_width: float, min_width: float = 0.05
) -> List[Tuple[float, float]]:
    """Find x-ranges that no word ever occupies.

    These vertical corridors are the real column separators. Because amounts
    are right-aligned, a corridor is far more reliable than a heading's edge
    for deciding where one column stops and the next begins.

    The word spans are merged exactly rather than painted into bins, because
    the gap that matters can be a fraction of a point wide -- a date column
    whose longest entry runs right up against the description beside it still
    has a real boundary, and rounding it away loses a column.
    """
    if not words:
        return []
    spans = sorted((w.x0, w.x1) for w in words)
    corridors: List[Tuple[float, float]] = []
    cursor = 0.0
    for x0, x1 in spans:
        if x0 - cursor >= min_width:
            corridors.append((cursor, x0))
        cursor = max(cursor, x1)
    if page_width - cursor >= min_width:
        corridors.append((cursor, page_width))
    return corridors


# --------------------------------------------------------------------------
# Table detection
# --------------------------------------------------------------------------

@dataclass
class Column:
    """One logical column, with the x-range that belongs to it."""
    field: str
    label: str
    x0: float
    x1: float
    header_x0: float
    header_x1: float

    def contains(self, x: float) -> bool:
        return self.x0 <= x < self.x1


@dataclass
class TableLayout:
    """Where the transaction table sits on a page, and what its columns mean."""
    columns: List[Column]
    header_top: float
    header_bottom: float
    #: How many boundaries were measured from whitespace rather than guessed
    #: from heading gaps. Higher means better evidence, so when pages disagree
    #: the best-evidenced layout is the one applied to the whole document.
    measured: int = 0

    @property
    def fields(self) -> List[str]:
        return [c.field for c in self.columns]

    def column(self, field: str) -> Optional[Column]:
        for c in self.columns:
            if c.field == field:
                return c
        return None

    def assign(self, x: float) -> Optional[Column]:
        for c in self.columns:
            if c.contains(x):
                return c
        return None


def _match_field(folded: str) -> Optional[str]:
    """Map a folded heading to a logical field name.

    Exact alias matches win; otherwise the longest alias contained in the
    heading decides, so "TRANSACTION DATE" resolves to date rather than
    description.
    """
    if not folded:
        return None
    for fieldname, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if folded == fold(alias):
                return fieldname

    best_field: Optional[str] = None
    best_len = 0
    for fieldname, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            key = fold(alias)
            if len(key) < 2:
                continue
            if key in folded and len(key) > best_len:
                best_len, best_field = len(key), fieldname
    # Two-character aliases ("dr", "cr") only count as a whole heading.
    if best_field and best_len <= 2 and len(folded) > 3:
        return None
    return best_field


def _header_candidates(line: TextLine) -> List[Tuple[str, Word, Word]]:
    """Find (field, first_word, last_word) groups in a potential header line.

    Headings run to several words -- "CASH OUT (Dr)", "ថ្ងៃ ខែ ឆ្នាំ" -- so
    adjacent words are tried together, longest run first.
    """
    words = line.words
    found: List[Tuple[str, Word, Word]] = []
    used: set[int] = set()
    n = len(words)
    for span in (4, 3, 2, 1):
        for i in range(n - span + 1):
            if any((i + k) in used for k in range(span)):
                continue
            group = words[i:i + span]
            # Words of one heading sit close together.
            if any(group[k + 1].x0 - group[k].x1 > 12.0 for k in range(span - 1)):
                continue
            joined = fold(undouble("".join(w.text for w in group)))
            if not joined:
                joined = fold("".join(undouble(w.text) for w in group))
            field = _match_field(joined)
            if field:
                found.append((field, group[0], group[-1]))
                used.update(i + k for k in range(span))
    return found


def find_header_line(lines: Sequence[TextLine]) -> Optional[Tuple[int, List[Tuple[str, Word, Word]]]]:
    """Pick the line that is the transaction table's heading row.

    Scored on how many distinct money/date fields it names, so an
    "ACCOUNT SUMMARY" block that merely mentions "Balance" cannot outrank the
    real header, which names a date column and at least one amount column.
    """
    best: Optional[Tuple[float, int, List[Tuple[str, Word, Word]]]] = None
    for idx, line in enumerate(lines):
        if len(line.words) > 14:
            continue
        hits = _header_candidates(line)
        if not hits:
            continue
        fields = {f for f, _, _ in hits}
        if len(fields) < 2:
            continue
        score = float(len(fields))
        if "date" in fields:
            score += 2.0
        if fields & {"debit", "credit"}:
            score += 2.0
        if "balance" in fields:
            score += 1.5
        if "description" in fields:
            score += 1.0
        if fields & {"amount"} and not fields & {"debit", "credit"}:
            score += 1.0
        # Prefer a header near the top of its table, not a stray later line.
        score -= idx * 0.002
        if best is None or score > best[0]:
            best = (score, idx, hits)
    if best is None:
        return None
    return best[1], best[2]


@dataclass
class HeaderInfo:
    """The heading row of a transaction table, resolved to logical fields."""
    index: int
    line: TextLine
    #: (field, first word, last word), left to right, one entry per field.
    ordered: List[Tuple[str, Word, Word]]

    @property
    def fields(self) -> List[str]:
        return [f for f, _, _ in self.ordered]


def find_header(lines: Sequence[TextLine]) -> Optional[HeaderInfo]:
    """Resolve the table's heading row into one entry per logical column."""
    found = find_header_line(lines)
    if not found:
        return None
    header_idx, hits = found
    # One column per field; keep the leftmost occurrence of each.
    by_field: Dict[str, Tuple[Word, Word]] = {}
    for fieldname, first, last in hits:
        if fieldname not in by_field or first.x0 < by_field[fieldname][0].x0:
            by_field[fieldname] = (first, last)
    ordered = sorted(
        ((f, pair[0], pair[1]) for f, pair in by_field.items()),
        key=lambda item: item[1].x0,
    )
    if len(ordered) < 2:
        return None
    return HeaderInfo(header_idx, lines[header_idx], list(ordered))


def layout_from(
    header: HeaderInfo,
    corridors: Sequence[Tuple[float, float]],
    page_width: float,
    body: Sequence[Word] = (),
) -> TableLayout:
    """Turn a heading row plus measured corridors into column x-ranges."""
    columns: List[Column] = []
    measured = 0
    for pos, (fieldname, first, last) in enumerate(header.ordered):
        left = 0.0 if pos == 0 else columns[-1].x1
        if pos + 1 < len(header.ordered):
            right, from_corridor = _boundary_between(
                last, header.ordered[pos + 1][1], corridors, body
            )
            measured += int(from_corridor)
        else:
            right = page_width
        label = normalize_text(
            " ".join(
                undouble(w.text)
                for w in header.line.words
                if first.x0 - 0.1 <= w.x0 <= last.x1 + 0.1
            )
        ) or fieldname
        columns.append(Column(fieldname, label, left, right, first.x0, last.x1))
    return TableLayout(columns, header.line.top, header.line.bottom, measured=measured)


def body_words(
    words: Sequence[Word], lines: Sequence[TextLine], header: HeaderInfo
) -> List[Word]:
    """The words that sit inside the transaction rows of this page."""
    bounds = _body_bounds(lines, header)
    if bounds is None:
        return [w for w in words if w.top >= header.line.bottom - 0.5]
    top, bottom = bounds
    return [w for w in words if w.top >= top - 0.5 and w.bottom <= bottom + 0.5]


#: A token that looks like printed money: grouped thousands, or two decimals.
_MONEY_TOKEN = re.compile(r"\d{1,3}(?:[,. \s]\d{3})+(?:[.,]\d{1,2})?|\d+[.,]\d{2}(?!\d)")


def _has_money_token(text: str) -> bool:
    return bool(_MONEY_TOKEN.search(khmer_digits_to_ascii(text or "")))


def _body_bounds(
    lines: Sequence[TextLine], header: HeaderInfo
) -> Optional[Tuple[float, float]]:
    """Vertical extent of the transaction rows on this page.

    Judged from the text of each line alone -- the last line below the header
    that carries money and is neither page furniture nor a totals line. It
    deliberately avoids using a column layout to decide this, because the
    layout is what these bounds are about to be used to measure: an earlier
    version asked a provisional layout which lines held a date, and on pages
    where that layout clipped the date column it saw almost no rows, pooled a
    fraction of the page into the corridor measurement, and mislaid a column
    edge as a result.
    """
    top = header.line.bottom
    bottom: Optional[float] = None
    for line in lines[header.index + 1:]:
        text = line.text
        if is_footer(text) or is_total_row(text):
            continue
        if _has_money_token(text):
            bottom = line.bottom
    if bottom is None or bottom <= top:
        return None
    return top, bottom


def _boundary_between(
    left_word: Word,
    right_word: Word,
    corridors: Sequence[Tuple[float, float]],
    body: Sequence[Word] = (),
) -> Tuple[float, bool]:
    """Choose the x that separates two adjacent columns.

    The window runs from the left heading's left edge to the right heading's
    right edge, because a right-aligned amount may begin well to the left of
    its own heading. Within it, the corridor nearest the right heading's left
    edge wins: that is the gap the next column's entries are pushed up
    against, whereas a wider corridor can easily be an accident of short text
    earlier in the row. Returns the boundary and whether it was measured.
    """
    lo, hi = left_word.x0, right_word.x1
    target = right_word.x0
    # A corridor counts when its middle falls between the two headings. Asking
    # instead that the whole corridor fit between them looks stricter but is
    # wrong: headings and the entries beneath them need not line up, and a
    # statement that prints "Debit" to the left of its own figures has its true
    # separator running on past the next heading. Judging by the midpoint keeps
    # that corridor, while still rejecting the wide gap on the other side of
    # the column, whose middle lies outside the window.
    inside = [
        (c0, c1) for c0, c1 in corridors
        if lo - 1.0 <= (c0 + c1) / 2.0 <= hi + 1.0
    ]
    # A comfortable gap is the normal case and the most trustworthy signal.
    # Hairline gaps are only consulted when there is no roomy one, so that a
    # column packed tight against its neighbour is still found.
    for floor in (2.5, 0.05):
        roomy = [c for c in inside if (c[1] - c[0]) >= floor]
        if roomy:
            best = min(
                roomy, key=lambda c: (abs((c[0] + c[1]) / 2 - target), -(c[1] - c[0]))
            )
            return (best[0] + best[1]) / 2.0, True

    # No gap anywhere: the two columns touch somewhere in the statement. A
    # long month name in a narrow date column does this. The next column is
    # then found by where its entries line up, which for a left-aligned column
    # is a sharp common edge shared by every row.
    edge = _shared_left_edge(body, right_word)
    if edge is not None:
        return edge - 0.25, True

    gap_lo, gap_hi = left_word.x1, right_word.x0
    return ((gap_lo + gap_hi) / 2.0 if gap_hi > gap_lo else gap_hi), False


def _shared_left_edge(body: Sequence[Word], right_word: Word) -> Optional[float]:
    """The x at which the next column's entries start, if they agree on one."""
    if not body:
        return None
    lo, hi = right_word.x0 - 6.0, right_word.x1 + 60.0
    counts: Dict[float, int] = {}
    for word in body:
        if lo <= word.x0 <= hi:
            key = round(word.x0 * 2.0) / 2.0
            counts[key] = counts.get(key, 0) + 1
    if not counts:
        return None
    # Most popular edge, and the leftmost of those if several tie.
    edge, hits = min(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return edge if hits >= 3 else None


# --------------------------------------------------------------------------
# Row assembly
# --------------------------------------------------------------------------

@dataclass
class Transaction:
    date: Optional[_dt.date] = None
    description: str = ""
    debit: Optional[float] = None
    credit: Optional[float] = None
    balance: Optional[float] = None
    amount: Optional[float] = None
    drcr: str = ""
    currency: Optional[str] = None
    page: int = 0

    def is_empty(self) -> bool:
        return (
            self.date is None
            and not self.description
            and self.debit is None
            and self.credit is None
            and self.balance is None
            and self.amount is None
        )


def is_footer(text: str) -> bool:
    return any(p.search(text) for p in FOOTER_PATTERNS)


def is_total_row(text: str) -> bool:
    return any(p.match(text) or p.search(text) for p in TOTAL_PATTERNS)


def line_cells(line: TextLine, layout: TableLayout) -> Dict[str, str]:
    """Split one line into its column cells.

    Each word is placed by its centre point, except that a money column takes
    a word whose right edge lands inside it -- right-aligned amounts overhang
    their boundary on the left far more often than on the right.
    """
    buckets: Dict[str, List[Word]] = {c.field: [] for c in layout.columns}
    for w in line.words:
        col = layout.assign(w.cx)
        if col is None:
            col = layout.assign(w.x1 - 0.5) or layout.assign(w.x0 + 0.5)
        if col is None:
            continue
        if col.field in MONEY_FIELDS:
            by_right = layout.assign(max(w.x0, w.x1 - 1.0))
            if by_right is not None and by_right.field in MONEY_FIELDS:
                col = by_right
        buckets[col.field].append(w)
    return {
        field: normalize_text(" ".join(w.text for w in sorted(ws, key=lambda w: w.x0)))
        for field, ws in buckets.items()
    }


@dataclass
class PageScan:
    """One page, read once: its words, its lines, its header and its body."""
    number: int
    width: float
    words: List[Word]
    lines: List[TextLine]
    header: Optional[HeaderInfo] = None
    body: List[Word] = field(default_factory=list)


def scan_page(
    page: Any, number: int, words: Optional[Sequence[Word]] = None
) -> PageScan:
    """Read a page's text, find its heading row and isolate its table body."""
    got = list(words) if words is not None else page_words(page)
    lines = group_lines(got)
    scan = PageScan(number, float(page.width), got, lines)
    if not got:
        return scan
    scan.header = find_header(lines)
    if scan.header is not None:
        scan.body = body_words(got, lines, scan.header)
    return scan


def assemble_rows(
    scan: PageScan, layout: TableLayout, dayfirst: bool
) -> Tuple[List[Transaction], List[str]]:
    """Turn one page's lines into transactions using the given column layout.

    A line opens a new transaction only when its date cell parses as a date;
    anything else is a wrapped continuation and folds into the row above.
    """
    skipped: List[str] = []
    if not scan.words:
        return [], skipped

    lines = scan.lines
    date_col = layout.column("date")
    rows: List[Transaction] = []
    current: Optional[Transaction] = None

    # Skip this page's own header when it has one; a page that inherited the
    # layout from elsewhere has table rows from its first line.
    start_y = scan.header.line.bottom if scan.header is not None else -1.0
    page_number = scan.number

    for line in lines:
        if line.top < start_y - 0.5:
            continue
        text = line.text
        if not text:
            continue
        if is_footer(text):
            continue

        cells = line_cells(line, layout)
        date_text = cells.get("date", "") if date_col else ""
        parsed_date = parse_date(date_text, dayfirst) if date_text else None

        # A repeat of the header on a later page.
        if parsed_date is None and _looks_like_header(cells):
            continue

        # A totals line ("ENDING BALANCE", "Total") closes the transaction
        # above it. Without this, whatever follows the table -- a disclaimer
        # paragraph, a signature block -- would be read as a continuation of
        # the last row and land in its description.
        if parsed_date is None and is_total_row(text):
            if current is not None and not current.is_empty():
                rows.append(current)
            current = None
            skipped.append(text)
            continue

        if parsed_date is not None:
            if current is not None and not current.is_empty():
                rows.append(current)
            current = Transaction(page=page_number)
            current.date = parsed_date
            _fill_cells(current, cells)
        elif current is not None:
            # A wrapped continuation of the transaction above.
            extra = cells.get("description", "")
            if extra:
                current.description = (current.description + " " + extra).strip()
            _fill_cells(current, cells, only_missing=True)
        else:
            skipped.append(text)

    if current is not None and not current.is_empty():
        rows.append(current)
    return rows, skipped


def _looks_like_header(cells: Dict[str, str]) -> bool:
    """True when a line's cells merely restate the column headings."""
    hits = 0
    for fieldname, text in cells.items():
        if not text:
            continue
        if _match_field(fold(undouble(text))) == fieldname:
            hits += 1
    return hits >= 2


def _fill_cells(txn: Transaction, cells: Dict[str, str], only_missing: bool = False) -> None:
    """Copy parsed cell values onto a transaction."""
    for fieldname in MONEY_FIELDS:
        raw = cells.get(fieldname, "")
        if not raw:
            continue
        value = parse_amount(raw)
        if value is None:
            continue
        if only_missing and getattr(txn, fieldname) is not None:
            continue
        setattr(txn, fieldname, value)
        if txn.currency is None:
            txn.currency = detect_currency(raw)

    desc = cells.get("description", "")
    if desc and not only_missing:
        txn.description = (txn.description + " " + desc).strip() if txn.description else desc

    if cells.get("drcr"):
        txn.drcr = cells["drcr"]
    if cells.get("currency") and not txn.currency:
        txn.currency = detect_currency(cells["currency"]) or normalize_text(cells["currency"])[:8]


# --------------------------------------------------------------------------
# Self-checking: does the ledger add up?
# --------------------------------------------------------------------------

@dataclass
class Check:
    name: str
    passed: bool
    detail: str


@dataclass
class StatementMeta:
    """What the statement says about itself."""
    bank: Optional[str] = None
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    currency: Optional[str] = None
    period: Optional[str] = None
    opening_balance: Optional[float] = None
    closing_balance: Optional[float] = None
    total_in: Optional[float] = None
    total_out: Optional[float] = None
    language: str = "English"


def _ledger_agreement(rows: Sequence[Transaction], swap: bool = False) -> Tuple[int, int]:
    """Count how many consecutive balances follow from the amounts.

    Returns (agreements, comparisons). The convention tested is
    ``balance = previous balance - debit + credit``.
    """
    agree = 0
    total = 0
    previous: Optional[float] = None
    for row in rows:
        if row.balance is None:
            previous = None
            continue
        debit = row.credit if swap else row.debit
        credit = row.debit if swap else row.credit
        if previous is not None and (debit is not None or credit is not None):
            expected = previous - (debit or 0.0) + (credit or 0.0)
            total += 1
            if abs(expected - row.balance) < 0.011:
                agree += 1
        previous = row.balance
    return agree, total


def normalise_columns(rows: List[Transaction], notes: List[str]) -> List[Transaction]:
    """Fix the two column problems the arithmetic can detect and correct.

    * Debit and credit printed the other way round: swapping them makes the
      running balance agree, so swap and say so.
    * A single signed "Amount" column instead of a debit/credit pair: split
      it, taking the sign, a Dr/Cr marker, or the balance movement as the cue.
    """
    if not rows:
        return rows

    has_pair = any(r.debit is not None or r.credit is not None for r in rows)
    has_amount = any(r.amount is not None for r in rows)

    if not has_pair and has_amount:
        for row in rows:
            if row.amount is None:
                continue
            marker = fold(row.drcr)
            if marker.startswith("dr") or marker in {"d", "debit", "w"}:
                row.debit, row.credit = abs(row.amount), None
            elif marker.startswith("cr") or marker in {"c", "credit", "dep"}:
                row.credit, row.debit = abs(row.amount), None
            elif row.amount < 0:
                row.debit = abs(row.amount)
            else:
                row.credit = row.amount
        # If signs were absent, let the balance movement decide.
        if all(r.debit is None for r in rows):
            previous: Optional[float] = None
            for row in rows:
                if row.balance is not None and previous is not None and row.amount is not None:
                    if row.balance < previous - 0.005:
                        row.debit, row.credit = abs(row.amount), None
                    else:
                        row.credit, row.debit = abs(row.amount), None
                if row.balance is not None:
                    previous = row.balance
        notes.append("Single amount column split into Debit and Credit.")
        has_pair = True

    if has_pair:
        plain_ok, plain_n = _ledger_agreement(rows, swap=False)
        swap_ok, _ = _ledger_agreement(rows, swap=True)
        if plain_n >= 3 and swap_ok > plain_ok and swap_ok - plain_ok >= max(2, plain_n // 5):
            for row in rows:
                row.debit, row.credit = row.credit, row.debit
            notes.append(
                f"Debit and Credit were reversed in the PDF and have been swapped "
                f"(balance now agrees on {swap_ok}/{plain_n} rows instead of {plain_ok})."
            )
    return rows


def dedupe_rows(rows: List[Transaction]) -> Tuple[List[Transaction], int]:
    """Remove rows repeated where a table spills across a page break."""
    seen: set[Tuple[Any, ...]] = set()
    out: List[Transaction] = []
    removed = 0
    for row in rows:
        key = (
            row.date,
            re.sub(r"\s+", " ", row.description)[:90].lower(),
            round(row.debit, 2) if row.debit is not None else None,
            round(row.credit, 2) if row.credit is not None else None,
            round(row.balance, 2) if row.balance is not None else None,
        )
        if key in seen and any(v is not None for v in key[2:]):
            removed += 1
            continue
        seen.add(key)
        out.append(row)
    return out, removed


def run_checks(rows: Sequence[Transaction], meta: StatementMeta) -> List[Check]:
    """Check the extraction against the statement's own arithmetic."""
    checks: List[Check] = []
    if not rows:
        return [Check("Rows found", False, "No transactions were extracted.")]

    checks.append(Check("Rows found", True, f"{len(rows)} transactions."))

    # Every row is created from a parsed date, so a missing date cannot
    # happen; a row with no money on it can, and means a column was misread.
    moneyless = sum(
        1 for r in rows
        if r.debit is None and r.credit is None and r.balance is None
    )
    checks.append(
        Check(
            "Every row carries an amount",
            moneyless == 0,
            "All rows have figures."
            if moneyless == 0
            else f"{moneyless} dated row(s) came out with no amount at all.",
        )
    )

    # The balance arithmetic is the strongest evidence the read is right, so
    # when it cannot run the result is reported as unverified rather than
    # omitted. Otherwise a stray table lifted out of some unrelated PDF, with
    # too few rows to check, would come back showing nothing but passes.
    agree, total = _ledger_agreement(rows)
    if total:
        rate = agree / total
        checks.append(
            Check(
                "Running balance adds up",
                rate >= 0.98,
                f"{agree} of {total} consecutive rows reconcile ({rate:.0%}).",
            )
        )
    else:
        checks.append(
            Check(
                "Running balance adds up",
                False,
                "Could not be checked: fewer than two rows carry both a balance "
                "and an amount, so the figures are unverified.",
            )
        )

    balances = [r.balance for r in rows if r.balance is not None]
    if balances and meta.closing_balance is not None:
        delta = abs(balances[-1] - meta.closing_balance)
        checks.append(
            Check(
                "Final balance matches statement",
                delta < 0.011,
                f"last row {balances[-1]:,.2f} vs stated {meta.closing_balance:,.2f}"
                + ("" if delta < 0.011 else f" (off by {delta:,.2f})"),
            )
        )

    if meta.total_in is not None:
        got = sum(r.credit or 0.0 for r in rows)
        delta = abs(got - abs(meta.total_in))
        checks.append(
            Check(
                "Total money in matches statement",
                delta < 0.05,
                f"extracted {got:,.2f} vs stated {abs(meta.total_in):,.2f}"
                + ("" if delta < 0.05 else f" (off by {delta:,.2f})"),
            )
        )
    if meta.total_out is not None:
        got = sum(r.debit or 0.0 for r in rows)
        delta = abs(got - abs(meta.total_out))
        checks.append(
            Check(
                "Total money out matches statement",
                delta < 0.05,
                f"extracted {got:,.2f} vs stated {abs(meta.total_out):,.2f}"
                + ("" if delta < 0.05 else f" (off by {delta:,.2f})"),
            )
        )

    dates = [r.date for r in rows if r.date]
    if len(dates) > 2:
        backwards = sum(1 for a, b in zip(dates, dates[1:]) if b < a)
        checks.append(
            Check(
                "Dates run in order",
                backwards <= len(dates) * 0.02,
                "Chronological." if backwards == 0 else f"{backwards} step(s) go backwards.",
            )
        )
    return checks


# --------------------------------------------------------------------------
# Statement metadata
# --------------------------------------------------------------------------

_LABELLED = {
    "account_name": ("account name", "account holder", "customer name", "name",
                     "ឈ្មោះគណនី", "ឈ្មោះ"),
    "account_number": ("account number", "account no", "account #", "a/c no",
                       "account", "លេខគណនី"),
    "currency": ("currency", "ccy", "រូបិយប័ណ្ណ"),
    "opening_balance": ("opening balance", "beginning balance", "balance brought forward",
                        "balance b/f", "previous balance", "សមតុល្យដើម"),
    "closing_balance": ("closing balance", "ending balance", "final balance",
                        "balance carried forward", "balance c/f", "សមតុល្យចុង"),
    "total_in": ("total cash in", "total credit", "total credits", "total deposit",
                 "total money in", "total in", "សរុបប្រាក់ចូល"),
    "total_out": ("total cash out", "total debit", "total debits", "total withdrawal",
                  "total money out", "total out", "សរុបប្រាក់ចេញ"),
}


def read_metadata(pages_text: Sequence[str]) -> StatementMeta:
    """Read the header block: who, which account, what period, what totals."""
    meta = StatementMeta()
    head = "\n".join(pages_text[:2])
    lowered = head.lower()

    for bank, needles in BANK_SIGNATURES:
        if any(n in lowered or n in head for n in needles):
            meta.bank = bank
            break

    for line in head.split("\n"):
        clean = normalize_text(undouble_line(line))
        if not clean:
            continue
        low = clean.lower()
        for fieldname, labels in _LABELLED.items():
            if getattr(meta, fieldname) is not None:
                continue
            for label in labels:
                idx = low.find(label)
                if idx < 0:
                    continue
                tail = _strip_separator(clean[idx + len(label):])
                if not tail:
                    continue
                # Statements often print two label/value pairs side by side,
                # so cut the value where the next label begins.
                tail = _cut_at_next_label(tail, label)
                if fieldname in {"opening_balance", "closing_balance", "total_in", "total_out"}:
                    value = parse_amount(tail)
                    if value is not None:
                        setattr(meta, fieldname, value)
                        if meta.currency is None:
                            meta.currency = detect_currency(tail)
                elif fieldname == "currency":
                    setattr(meta, fieldname, detect_currency(tail) or tail[:8])
                elif fieldname == "account_number":
                    m = re.search(r"[\d][\d\-\s*]{4,}", tail)
                    if m:
                        setattr(meta, fieldname, m.group(0).strip())
                else:
                    setattr(meta, fieldname, tail[:80])
                break

    m = re.search(
        r"(?:from|period|statement period|ចាប់ពី)\s*[:\s]\s*(.{4,40}?)\s*(?:to|until|-|ដល់)\s*(.{4,30})",
        head,
        re.IGNORECASE,
    )
    if m:
        start = parse_date(m.group(1))
        end = parse_date(m.group(2))
        if start and end:
            meta.period = f"{start.isoformat()} to {end.isoformat()}"
        else:
            meta.period = normalize_text(m.group(1) + " to " + m.group(2))[:60]

    if has_khmer(head):
        meta.language = "Khmer + English" if re.search(r"[A-Za-z]{3}", head) else "Khmer"
    return meta


def _strip_separator(text: str) -> str:
    """Drop the separator between a label and its value.

    A dash can be the separator ("Account name - Bou Tharin") or the sign of
    the value itself ("Closing balance : -1,204.55"), so a dash is only
    removed when a digit does not follow it.
    """
    text = text.lstrip("  \t:=")
    while text[:1] == "-" and not text[1:2].isdigit():
        text = text[1:].lstrip("  \t")
    return text


def _cut_at_next_label(tail: str, current_label: str) -> str:
    """Trim a label's value where the next label on the same line starts.

    "Account name : Bou Tharin Opening balance : 5,797,423.00 KHR" is one text
    line in a two-column header block, so the value for account name has to
    stop at "Opening balance".
    """
    lowered = tail.lower()
    cut = len(tail)
    for labels in _LABELLED.values():
        for label in labels:
            if label == current_label:
                continue
            found = lowered.find(label)
            if 0 < found < cut:
                cut = found
    tail = tail[:cut]
    # Also stop at an obvious column break.
    tail = re.split(r"\s{3,}|\s\|\s", tail)[0]
    return _strip_separator(tail).rstrip(" :-\t")


def undouble_line(line: str) -> str:
    """Apply :func:`undouble` to each whitespace-separated token in a line."""
    return " ".join(undouble(tok) for tok in (line or "").split())


# --------------------------------------------------------------------------
# OCR fallback for scanned statements
# --------------------------------------------------------------------------

def ocr_available() -> Tuple[bool, str]:
    """Report whether an OCR backend is usable, and which."""
    try:
        import pytesseract  # noqa: F401
        from PIL import Image  # noqa: F401
    except Exception:
        return False, "pytesseract/pillow not installed"
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
    except Exception:
        return False, "Tesseract binary not found on PATH"
    return True, "pytesseract"


def ocr_page_words(page: Any, dpi: int = 300, languages: str = "khm+eng") -> List[Word]:
    """OCR one page into positioned words, in the same shape as the text layer.

    Feeding OCR output through the identical column logic means a scanned
    statement takes exactly the same path as a digital one.
    """
    import pytesseract
    from pytesseract import Output

    image = page.to_image(resolution=dpi).original
    scale = 72.0 / float(dpi)
    try:
        data = pytesseract.image_to_data(image, lang=languages, output_type=Output.DICT)
    except Exception:
        data = pytesseract.image_to_data(image, output_type=Output.DICT)

    words: List[Word] = []
    for i in range(len(data["text"])):
        text = normalize_text(data["text"][i])
        if not text:
            continue
        try:
            conf = float(data.get("conf", ["-1"])[i])
        except (TypeError, ValueError):
            conf = -1.0
        if conf >= 0 and conf < 35:
            continue
        x = float(data["left"][i]) * scale
        y = float(data["top"][i]) * scale
        w = float(data["width"][i]) * scale
        h = float(data["height"][i]) * scale
        words.append(Word(text, x, x + w, y, y + h))
    words.sort(key=lambda w: (w.top, w.x0))
    return words


# --------------------------------------------------------------------------
# Whole-PDF extraction
# --------------------------------------------------------------------------

@dataclass
class Result:
    """Everything one PDF produced."""
    source: Path
    rows: List[Transaction] = field(default_factory=list)
    meta: StatementMeta = field(default_factory=StatementMeta)
    checks: List[Check] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    pages: int = 0
    used_ocr: bool = False
    skipped: List[str] = field(default_factory=list)


def extract_pdf(
    path: Path,
    dayfirst: bool = True,
    ocr_mode: str = "auto",
    password: Optional[str] = None,
    ocr_dpi: int = 300,
    ocr_languages: str = "khm+eng",
    progress: Optional[Any] = None,
) -> Result:
    """Extract one statement PDF into rows plus a self-check report."""
    result = Result(source=path)
    kwargs: Dict[str, Any] = {}
    if password:
        kwargs["password"] = password

    with pdfplumber.open(str(path), **kwargs) as pdf:
        result.pages = len(pdf.pages)
        pages_text: List[str] = []
        scans: List[PageScan] = []
        force_ocr = ocr_mode == "force"

        for index, page in enumerate(pdf.pages, start=1):
            if progress:
                progress(index, result.pages)

            words = [] if force_ocr else page_words(page)
            # A page with almost no text layer is a scan.
            if (force_ocr or len(words) < 6) and ocr_mode != "off":
                usable, why = ocr_available()
                if usable:
                    try:
                        words = ocr_page_words(page, ocr_dpi, ocr_languages)
                        result.used_ocr = True
                    except Exception as exc:
                        result.notes.append(f"OCR failed on page {index}: {exc}")
                elif force_ocr or not words:
                    result.notes.append(f"Page {index} needs OCR but it is unavailable ({why}).")

            if not words:
                continue

            scan = scan_page(page, index, words)
            scans.append(scan)
            pages_text.append("\n".join(ln.text for ln in scan.lines))

        # Statement PDFs are generated, so every page puts its columns in the
        # same place. Settle on one layout for the document rather than letting
        # each page measure its own from whatever happens to be printed on it.
        document = _document_layout(scans)
        if document is not None:
            for scan in scans:
                layout = _layout_for(scan, document)
                rows, skipped = assemble_rows(scan, layout, dayfirst)
                result.rows.extend(rows)
                result.skipped.extend(skipped)

    result.meta = read_metadata(pages_text)
    if not result.meta.bank:
        result.meta.bank = guess_bank_from_name(path)

    result.rows = normalise_columns(result.rows, result.notes)
    result.rows, removed = dedupe_rows(result.rows)
    if removed:
        result.notes.append(f"Removed {removed} duplicate row(s) repeated across page breaks.")

    # Fill in a currency for rows that did not state one.
    fallback_currency = result.meta.currency or next(
        (r.currency for r in result.rows if r.currency), None
    )
    for row in result.rows:
        if not row.currency:
            row.currency = fallback_currency

    result.checks = run_checks(result.rows, result.meta)
    return result


def body_pool(scans: Sequence[PageScan]) -> List[Word]:
    """Every page's table-body words together, for one document-wide measurement.

    Measuring page by page is not enough. A column's width is set by its
    widest entry anywhere in the statement -- a long month name such as
    "កក្កដា" that only falls in July, or a six-figure amount that only appears
    on the last page. Corridors taken from one page would cut straight through
    those, so the bodies are pooled and only the gaps that survive across the
    whole document become boundaries.
    """
    pooled = [w for s in scans if s.header is not None for w in s.body]
    return pooled or [w for s in scans for w in s.words]


@dataclass
class DocumentLayout:
    """One column layout for the whole statement, plus what it was measured from."""
    layout: TableLayout
    corridors: List[Tuple[float, float]]
    pool: List[Word]


def _document_layout(scans: Sequence[PageScan]) -> Optional[DocumentLayout]:
    """Settle on one column layout for the whole document."""
    headed = [s for s in scans if s.header is not None]
    if not headed:
        return None
    width = max(s.width for s in headed)
    pool = body_pool(headed)
    corridors = whitespace_corridors(pool, width)
    # Prefer the header that names the most columns; earliest page breaks ties.
    best = min(headed, key=lambda s: (-len(s.header.ordered), s.number))
    return DocumentLayout(layout_from(best.header, corridors, width, pool), corridors, pool)


def _layout_for(scan: PageScan, document: DocumentLayout) -> TableLayout:
    """Use the document layout, unless this page's own header disagrees.

    The x-ranges come from the document layout so every page splits its
    columns identically. A page whose headings sit somewhere else entirely --
    a different table altogether -- is measured on its own terms instead.
    """
    if scan.header is None:
        return document.layout
    shared = {c.field: c for c in document.layout.columns}
    drift = [
        abs(first.x0 - shared[fieldname].header_x0)
        for fieldname, first, _ in scan.header.ordered
        if fieldname in shared
    ]
    if len(drift) < 2 or max(drift) > 15.0:
        return layout_from(scan.header, document.corridors, scan.width, document.pool)
    return document.layout


def is_encrypted(path: Path) -> bool:
    """Whether the PDF declares an /Encrypt dictionary.

    Checked against the bytes because a wrong or missing password comes back
    as an empty, generically typed exception, which gives nothing to tell the
    person. Only the head and tail are read: the trailer lives at the end, and
    a linearised file repeats it at the start.
    """
    try:
        with open(path, "rb") as handle:
            head = handle.read(4096)
            try:
                handle.seek(max(0, os.path.getsize(path) - 8192))
            except OSError:
                return b"/Encrypt" in head
            return b"/Encrypt" in head or b"/Encrypt" in handle.read()
    except OSError:
        return False


def guess_bank_from_name(path: Path) -> Optional[str]:
    """Last resort: read the bank out of the file name."""
    stem = path.stem.lower()
    for bank, needles in BANK_SIGNATURES:
        short = bank.split()[0].lower()
        if short in stem or any(n.split()[0] in stem for n in needles):
            return bank
    return None


# --------------------------------------------------------------------------
# Excel output
# --------------------------------------------------------------------------

SHEET_COLUMNS = (
    ("Date", "date", 12),
    ("Description", "description", 58),
    ("Debit", "debit", 16),
    ("Credit", "credit", 16),
    ("Balance", "balance", 18),
    ("Currency", "currency", 10),
    ("Page", "page", 7),
)

_HEADER_FILL = "FF1F3864"
_BAND_FILL = "FFF2F5FA"
_MONEY_FORMAT = "#,##0.00"


def _safe_sheet_name(name: str, taken: Sequence[str]) -> str:
    """Excel sheet names: 31 chars, no []:*?/\\ and unique."""
    clean = re.sub(r"[\[\]:*?/\\]", "-", name).strip() or "Statement"
    clean = clean[:31]
    if clean not in taken:
        return clean
    for n in range(2, 100):
        suffix = f" ({n})"
        candidate = clean[: 31 - len(suffix)] + suffix
        if candidate not in taken:
            return candidate
    return clean[:28] + "_xx"


def _write_transactions_sheet(workbook: Any, result: Result, title: str) -> Any:
    sheet = workbook.create_sheet(_safe_sheet_name(title, workbook.sheetnames))

    header_font = Font(bold=True, color="FFFFFFFF", size=11)
    header_fill = PatternFill("solid", fgColor=_HEADER_FILL)
    for index, (label, _, width) in enumerate(SHEET_COLUMNS, start=1):
        cell = sheet.cell(row=1, column=index, value=label)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        sheet.column_dimensions[get_column_letter(index)].width = width
    sheet.row_dimensions[1].height = 20

    band = PatternFill("solid", fgColor=_BAND_FILL)
    for offset, row in enumerate(result.rows):
        excel_row = offset + 2
        values = {
            "date": row.date,
            "description": row.description,
            "debit": row.debit,
            "credit": row.credit,
            "balance": row.balance,
            "currency": row.currency,
            "page": row.page or None,
        }
        for index, (_, key, _w) in enumerate(SHEET_COLUMNS, start=1):
            cell = sheet.cell(row=excel_row, column=index, value=values[key])
            if key == "date":
                cell.number_format = "yyyy-mm-dd"
                cell.alignment = Alignment(horizontal="left")
            elif key in {"debit", "credit", "balance"}:
                cell.number_format = _MONEY_FORMAT
            elif key == "description":
                cell.alignment = Alignment(vertical="top", wrap_text=True)
            elif key in {"currency", "page"}:
                cell.alignment = Alignment(horizontal="center")
            if offset % 2:
                cell.fill = band

    last = len(result.rows) + 1
    if last >= 2:
        sheet.auto_filter.ref = f"A1:{get_column_letter(len(SHEET_COLUMNS))}{last}"
        # Totals directly under the data, so the sheet is usable as-is.
        total_row = last + 1
        sheet.cell(row=total_row, column=2, value="Total").font = Font(bold=True)
        for index, (_, key, _w) in enumerate(SHEET_COLUMNS, start=1):
            if key in {"debit", "credit"}:
                letter = get_column_letter(index)
                cell = sheet.cell(
                    row=total_row, column=index,
                    value=f"=SUBTOTAL(109,{letter}2:{letter}{last})",
                )
                cell.number_format = _MONEY_FORMAT
                cell.font = Font(bold=True)
    sheet.freeze_panes = "A2"
    return sheet


def _write_summary_sheet(workbook: Any, results: Sequence[Result]) -> None:
    sheet = workbook.create_sheet(_safe_sheet_name("Summary", workbook.sheetnames), 0)
    bold = Font(bold=True)
    title = Font(bold=True, size=14)

    sheet["A1"] = "Statement extraction summary"
    sheet["A1"].font = title
    sheet["A2"] = f"Produced {_dt.datetime.now().strftime('%Y-%m-%d %H:%M')} by statement_to_excel {__version__}"
    sheet.column_dimensions["A"].width = 34
    sheet.column_dimensions["B"].width = 62

    line = 4
    for result in results:
        meta = result.meta
        sheet.cell(row=line, column=1, value=result.source.name).font = bold
        line += 1
        facts = [
            ("Bank", meta.bank or "not identified"),
            ("Account name", meta.account_name or "-"),
            ("Account number", meta.account_number or "-"),
            ("Currency", meta.currency or "-"),
            ("Statement period", meta.period or "-"),
            ("Language", meta.language),
            ("Pages read", str(result.pages)),
            ("Transactions", str(len(result.rows))),
            ("Read with OCR", "yes" if result.used_ocr else "no"),
        ]
        if meta.opening_balance is not None:
            facts.append(("Opening balance (stated)", f"{meta.opening_balance:,.2f}"))
        if meta.closing_balance is not None:
            facts.append(("Closing balance (stated)", f"{meta.closing_balance:,.2f}"))
        facts.append(("Debit total (extracted)", f"{sum(r.debit or 0 for r in result.rows):,.2f}"))
        facts.append(("Credit total (extracted)", f"{sum(r.credit or 0 for r in result.rows):,.2f}"))

        for label, value in facts:
            sheet.cell(row=line, column=1, value=label)
            sheet.cell(row=line, column=2, value=value)
            line += 1

        sheet.cell(row=line, column=1, value="Checks").font = bold
        line += 1
        for check in result.checks:
            sheet.cell(row=line, column=1, value=("PASS  " if check.passed else "CHECK ") + check.name)
            sheet.cell(row=line, column=2, value=check.detail)
            line += 1
        for note in result.notes:
            sheet.cell(row=line, column=1, value="Note")
            sheet.cell(row=line, column=2, value=note)
            line += 1
        line += 1


def write_excel(results: Sequence[Result], out_path: Path) -> Path:
    """Write one workbook: a Summary sheet plus a sheet per statement."""
    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)

    for result in results:
        title = result.meta.account_number or result.source.stem
        if len(results) == 1:
            title = "Transactions"
        _write_transactions_sheet(workbook, result, title)

    _write_summary_sheet(workbook, results)
    workbook.active = 0

    out_path.parent.mkdir(parents=True, exist_ok=True)
    workbook.save(str(out_path))
    return out_path


def write_csv(result: Result, out_path: Path) -> Path:
    import csv

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([label for label, _, _ in SHEET_COLUMNS])
        for row in result.rows:
            writer.writerow([
                row.date.isoformat() if row.date else "",
                row.description,
                "" if row.debit is None else f"{row.debit:.2f}",
                "" if row.credit is None else f"{row.credit:.2f}",
                "" if row.balance is None else f"{row.balance:.2f}",
                row.currency or "",
                row.page or "",
            ])
    return out_path


# --------------------------------------------------------------------------
# Console presentation
# --------------------------------------------------------------------------

class Console:
    """Plain-text console output that degrades on terminals without unicode."""

    def __init__(self, quiet: bool = False) -> None:
        self.quiet = quiet
        self.fancy = True
        try:
            "✓ •".encode(sys.stdout.encoding or "utf-8")
        except Exception:
            self.fancy = False

    def _put(self, text: str = "") -> None:
        if self.quiet:
            return
        if not self.fancy:
            text = (text.replace("✓", "OK").replace("✗", "!!")
                        .replace("•", "-").replace("…", "..."))
        try:
            print(text)
        except UnicodeEncodeError:
            print(text.encode("ascii", "replace").decode("ascii"))

    def title(self, text: str) -> None:
        self._put()
        self._put(text)
        self._put("=" * min(len(text), 70))

    def line(self, text: str = "") -> None:
        self._put(text)

    def item(self, text: str) -> None:
        self._put(f"  • {text}")

    def good(self, text: str) -> None:
        self._put(f"  ✓ {text}")

    def warn(self, text: str) -> None:
        self._put(f"  ✗ {text}")

    def step(self, text: str) -> None:
        self._put(f"\n{text}")

    def progress(self, current: int, total: int, label: str = "page") -> None:
        if self.quiet or not sys.stdout.isatty():
            return
        width = 28
        filled = int(width * current / max(total, 1))
        bar = "#" * filled + "." * (width - filled)
        sys.stdout.write(f"\r  reading [{bar}] {label} {current}/{total}")
        sys.stdout.flush()
        if current >= total:
            sys.stdout.write("\r" + " " * (width + 34) + "\r")
            sys.stdout.flush()


def report(console: Console, result: Result) -> None:
    """Print what was found and whether it adds up."""
    meta = result.meta
    console.step(f"{result.source.name}")
    facts = []
    if meta.bank:
        facts.append(meta.bank)
    if meta.account_number:
        facts.append(f"account {meta.account_number}")
    if meta.currency:
        facts.append(meta.currency)
    if meta.period:
        facts.append(meta.period)
    if facts:
        console.item(" • ".join(facts))
    console.item(
        f"{len(result.rows)} transactions from {result.pages} page(s)"
        + (" (OCR)" if result.used_ocr else "")
    )
    if result.rows:
        debit = sum(r.debit or 0.0 for r in result.rows)
        credit = sum(r.credit or 0.0 for r in result.rows)
        console.item(f"debit {debit:,.2f}   credit {credit:,.2f}")

    for check in result.checks:
        (console.good if check.passed else console.warn)(f"{check.name}: {check.detail}")
    for note in result.notes:
        console.item(f"note: {note}")


# --------------------------------------------------------------------------
# Input selection
# --------------------------------------------------------------------------

def choose_file_dialog() -> List[Path]:
    """Open the OS file picker, if there is a desktop to show it on."""
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception:
        return []
    try:
        root = tk.Tk()
        root.withdraw()
        root.update()
        picked = filedialog.askopenfilenames(
            title="Choose one or more bank statement PDFs",
            filetypes=[("PDF statements", "*.pdf"), ("All files", "*.*")],
        )
        root.destroy()
        return [Path(p) for p in picked]
    except Exception:
        return []


def choose_file_prompt() -> List[Path]:
    """Terminal fallback: list the PDFs nearby and take a number or a path."""
    here = sorted(Path.cwd().glob("*.pdf"))
    if here:
        print("\nPDFs in this folder:\n")
        for index, item in enumerate(here, start=1):
            print(f"  {index:2d}. {item.name}")
        print()
        answer = input("Number, or a path to a PDF (blank to cancel): ").strip()
    else:
        answer = input("\nPath to the statement PDF (blank to cancel): ").strip()
    if not answer:
        return []
    answer = answer.strip('"').strip("'")
    if answer.isdigit() and here and 1 <= int(answer) <= len(here):
        return [here[int(answer) - 1]]
    candidate = Path(answer).expanduser()
    return [candidate] if candidate.exists() else []


def collect_inputs(patterns: Sequence[str]) -> List[Path]:
    """Expand arguments into a list of PDFs: files, folders and globs."""
    found: List[Path] = []
    for pattern in patterns:
        cleaned = pattern.strip('"').strip("'")
        path = Path(cleaned).expanduser()
        if path.is_dir():
            found.extend(sorted(path.glob("*.pdf")))
        elif path.exists():
            found.append(path)
        else:
            matches = [Path(p) for p in glob.glob(cleaned)]
            found.extend(sorted(p for p in matches if p.is_file()))
    unique: List[Path] = []
    seen: set[str] = set()
    for path in found:
        key = str(path.resolve()).lower()
        if key not in seen:
            seen.add(key)
            unique.append(path)
    return unique


def default_output(paths: Sequence[Path], separate: bool) -> Path:
    """Name the workbook after the statement, beside the statement."""
    first = paths[0]
    if separate or len(paths) == 1:
        return first.with_name(f"{first.stem}.xlsx")
    return first.parent / f"statements_{_dt.date.today().isoformat()}.xlsx"


def reveal(path: Path) -> None:
    """Show the finished file in the file manager, best effort."""
    try:
        if sys.platform.startswith("win"):
            os.startfile(str(path))  # noqa: S606 - user asked for the result
        elif sys.platform == "darwin":
            import subprocess
            subprocess.run(["open", str(path)], check=False)
        else:
            import subprocess
            subprocess.run(["xdg-open", str(path)], check=False)
    except Exception:
        pass


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="statement_to_excel",
        description="Turn bank statement PDFs into a clean Excel table. "
                    "Columns are detected automatically, in English or Khmer.",
        epilog="Run with no arguments to pick a file and let everything else default.",
    )
    parser.add_argument("inputs", nargs="*",
                        help="PDF files, folders or globs. Omit to be asked.")
    parser.add_argument("-o", "--out", help="Output .xlsx path.")
    parser.add_argument("--separate", action="store_true",
                        help="One workbook per PDF instead of one combined book.")
    parser.add_argument("--csv", action="store_true",
                        help="Also write a .csv next to each workbook.")
    parser.add_argument("--monthfirst", action="store_true",
                        help="Read ambiguous numeric dates as MM/DD/YYYY (default DD/MM/YYYY).")
    parser.add_argument("--ocr", choices=("auto", "off", "force"), default="auto",
                        help="OCR for scanned statements: auto (default), off, or force.")
    parser.add_argument("--ocr-lang", default="khm+eng",
                        help="Tesseract languages when OCR runs (default khm+eng).")
    parser.add_argument("--ocr-dpi", type=int, default=300,
                        help="Render resolution for OCR (default 300).")
    parser.add_argument("--password", help="Password for an encrypted PDF.")
    parser.add_argument("--report", action="store_true",
                        help="Also print the lines that were not read as transactions.")
    parser.add_argument("--no-open", action="store_true",
                        help="Do not open the workbook when finished.")
    parser.add_argument("-q", "--quiet", action="store_true", help="Only print errors.")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    require_dependencies()
    console = Console(args.quiet)

    console.title(f"Bank statement to Excel  {__version__}")

    paths = collect_inputs(args.inputs)
    if not paths:
        if args.inputs:
            console.warn("None of those paths matched a PDF.")
            return 1
        console.line("\nNo file given, so let's pick one.")
        paths = choose_file_dialog() or choose_file_prompt()
    if not paths:
        console.line("\nNothing to do.")
        return 1

    missing = [p for p in paths if not p.exists()]
    if missing:
        for path in missing:
            console.warn(f"not found: {path}")
        return 1

    console.line(f"\n{len(paths)} file(s) to read.")
    dayfirst = not args.monthfirst

    if args.ocr == "force":
        usable, why = ocr_available()
        if not usable:
            console.warn(f"--ocr force was asked for, but OCR is unavailable: {why}")
            console.item("Install with: pip install pytesseract pillow")
            console.item("and install Tesseract itself, with the khm language data for Khmer.")
            return 2

    results: List[Result] = []
    failures = 0
    for path in paths:
        try:
            result = extract_pdf(
                path,
                dayfirst=dayfirst,
                ocr_mode=args.ocr,
                password=args.password,
                ocr_dpi=args.ocr_dpi,
                ocr_languages=args.ocr_lang,
                progress=lambda c, t: console.progress(c, t),
            )
        except Exception as exc:
            failures += 1
            console.step(path.name)
            # A missing or wrong PDF password surfaces as an empty message
            # wrapped in a generic exception type, so the file itself is asked
            # whether it is encrypted rather than relying on the wording.
            detail = str(exc).strip() or type(exc).__name__
            if is_encrypted(path):
                if args.password:
                    console.warn("the password was not accepted.")
                else:
                    console.warn("this PDF is password protected.")
                    console.item("Read it with: --password YOURPASSWORD")
            else:
                console.warn(f"could not be read: {detail}")
            continue

        report(console, result)
        if not result.rows:
            console.item("No transaction table was found on any page.")
            if not result.used_ocr:
                console.item("If this is a scan, try: --ocr force")
        if args.report and result.skipped:
            console.item("lines not read as transactions:")
            for text in result.skipped[:15]:
                console.line(f"      {text[:110]}")
            if len(result.skipped) > 15:
                console.line(f"      ... and {len(result.skipped) - 15} more")
        results.append(result)

    extracted = [r for r in results if r.rows]
    if not extracted:
        console.step("Nothing was extracted, so no workbook was written.")
        return 1

    written: List[Path] = []
    if args.separate:
        folder = Path(args.out).expanduser().parent if args.out else None
        for result in extracted:
            target = (folder / f"{result.source.stem}.xlsx") if folder \
                else result.source.with_name(f"{result.source.stem}.xlsx")
            written.append(write_excel([result], target))
            if args.csv:
                write_csv(result, target.with_suffix(".csv"))
    else:
        target = Path(args.out).expanduser() if args.out else default_output(
            [r.source for r in extracted], args.separate
        )
        if target.suffix.lower() != ".xlsx":
            target = target.with_suffix(".xlsx")
        written.append(write_excel(extracted, target))
        if args.csv:
            for result in extracted:
                suffix = "" if len(extracted) == 1 else f"_{result.source.stem}"
                write_csv(result, target.with_name(target.stem + suffix + ".csv"))

    total_rows = sum(len(r.rows) for r in extracted)
    console.step(f"Done. {total_rows} transactions written.")
    for path in written:
        console.item(str(path))

    unresolved = [c for r in extracted for c in r.checks if not c.passed]
    if unresolved:
        console.line()
        console.warn(f"{len(unresolved)} check(s) did not pass -- see the Summary sheet.")
        console.item("The rows are still written; the Summary sheet says what disagreed.")

    if written and not args.no_open and not args.quiet:
        reveal(written[0])
    return 1 if failures and not extracted else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nStopped.")
        sys.exit(130)
