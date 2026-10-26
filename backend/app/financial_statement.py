"""Financial statement account map and normal-balance rules."""

ACCOUNT_NAMES = {
    "1000": "Cash", "1010": "Bank & wallet", "1100": "Accounts receivable", "1200": "Inventory",
    "1300": "Prepaid expenses", "1500": "Equipment & vehicles", "1590": "Accumulated depreciation",
    "1600": "Other long-term assets", "2000": "Accounts payable", "2100": "Customer deposits",
    "2200": "Accrued expenses", "2300": "Taxes payable", "2400": "Short-term loans (bank / MFI)",
    "2500": "Other short-term borrowings", "2600": "Long-term loans", "2700": "Lease obligations",
    "3000": "Owner's capital", "3100": "Retained earnings", "3200": "Owner's drawings",
    "4000": "Sales revenue", "4100": "Service revenue", "4200": "Other income", "4900": "Sales returns & discounts",
    "5000": "Cost of goods sold", "6000": "Rent", "6100": "Salaries & wages", "6200": "Utilities",
    "6300": "Internet & phone", "6400": "Transport & delivery", "6500": "Marketing & advertising",
    "6600": "Repairs & maintenance", "6700": "Insurance", "6800": "Depreciation", "6900": "Bank & wallet fees",
    "6950": "Licences & government fees", "6990": "Other expenses", "7000": "Interest expense", "7100": "Income tax expense",
}

ONBOARDING_ACCOUNT_MAP = {
    "cash_bank": "1000", "receivable": "1100", "inventory": "1200", "prepaid": "1300",
    "equipment": "1500", "other_long_term": "1600", "accounts_payable": "2000",
    "customer_deposits": "2100", "accrued_expenses": "2200", "short_term_loans": "2400",
    "other_short_borrowings": "2500", "long_term_loans": "2600", "lease_obligations": "2700",
    "owner_capital": "3000", "retained_earnings": "3100", "net_profit_for_period": "3100", "owner_drawings": "3200",
}

DEBIT_NORMAL_ACCOUNTS = {
    "1000", "1010", "1100", "1200", "1300", "1500", "1600", "3200", "4900", "5000",
    "6000", "6100", "6200", "6300", "6400", "6500", "6600", "6700", "6800", "6900",
    "6950", "6990", "7000", "7100",
}


def natural_balance(codes: tuple[str, ...], values: dict[str, int]) -> int:
    """Return account balances on their natural debit/credit side."""
    return sum(values.get(code, 0) if code in DEBIT_NORMAL_ACCOUNTS else -values.get(code, 0) for code in codes)
