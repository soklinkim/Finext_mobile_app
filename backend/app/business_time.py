"""The business calendar used for "today", weeks, months and period ends.

FINEXT serves businesses in Cambodia (UTC+7 all year, no daylight saving). Bucketing in UTC
put entries made between midnight and 07:00 on the previous day, and at month ends in the
previous month. Timestamps themselves stay as epoch milliseconds; only calendar maths uses this.
"""
from datetime import timedelta, timezone

BUSINESS_TZ = timezone(timedelta(hours=7), "Asia/Phnom_Penh")
