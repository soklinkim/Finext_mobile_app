from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from fastapi import APIRouter, Depends, HTTPException, Query
from app import db
from app.auth import current_user

Currency = Literal["KHR", "USD"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SyncRow(CamelModel):
    id: str
    created_at: int  # epoch ms
    updated_at: int
    deleted_at: Optional[int] = None
    sync_status: Optional[Literal["pending", "synced"]] = None  # ignored by server


class Bank(SyncRow):
    name: str
    kind: Literal["cash", "bank", "wallet"]
    logo_key: Optional[str] = None


class Category(SyncRow):
    name: str
    icon: str
    kind: Literal["expense", "income", "savings"] = "expense"
    built_in: bool = False
    # Savings goals only: the amount to save, in minor units, and its currency.
    target_amount: Optional[int] = Field(default=None, ge=0)
    target_currency: Optional[Literal["KHR", "USD"]] = None


class Transaction(SyncRow):
    title: str
    type_id: str
    direction: Literal["in", "out", "move"]
    group_id: Optional[str] = None
    amount: int  # minor units: USD cents, KHR riel. Never a float.
    currency: Currency
    exchange_rate: int  # KHR per 1 USD
    pay_method: Literal["cash", "bank", "later"]
    bank_id: Optional[str] = None
    to_bank_id: Optional[str] = None
    category_id: Optional[str] = None
    counterparty: Optional[str] = None
    note: Optional[str] = None
    occurred_at: int
    review_flag: bool = False
    meta: Optional[str] = None  # JSON string


class BusinessAsset(SyncRow):
    kind: Literal["cash_bank", "receivable", "inventory", "prepaid", "equipment", "other_long_term"]
    name: str
    bank_id: Optional[str] = None
    amount: int
    currency: Currency
    as_of: int


class Budget(SyncRow):
    name: str
    period: Literal["all", "monthly"] = "all"
    target_amount: int
    currency: Currency


class Settings(SyncRow):
    language: Literal["en-GB", "km"] = "en-GB"
    onboarding_status: Literal["not_started", "in_progress", "completed"] = "not_started"
    start_option: Optional[Literal["new", "existing"]] = None
    display_currency: Currency = "USD"
    rate_khr_per_usd: int = 4000
    business_name: Optional[str] = None
    business_industry: Optional[str] = None
    registration_status: Optional[Literal["registered", "unregistered"]] = None
    registration_number: Optional[str] = None
    start_operation_date: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    owner_phone: Optional[str] = None
    location: Optional[str] = None
    contact: Optional[str] = None
    main_products: Optional[str] = None
    push_notifications: bool = True
    dark_theme: bool = False


class OnboardingFinancialEntry(SyncRow):
    section: Literal["balance_sheet", "income_statement"]
    entry_key: str
    amount: int  # minor units; net profit may be negative
    currency: Currency
    as_of: Optional[int] = None
    period_start: Optional[int] = None
    period_end: Optional[int] = None


class PushBatch(BaseModel):
    table: Literal[
        "banks", "categories", "transactions", "business_assets", "budgets",
        "onboarding_financial_entries", "settings",
    ]
    rows: list[dict]  # validated one by one in the router


class PushRequest(BaseModel):
    batches: list[PushBatch]


class RejectedRow(BaseModel):
    table: str
    id: str
    reason: str


class SyncConflict(BaseModel):
    table: str
    row: dict


class PushResponse(BaseModel):
    accepted: dict[str, list[str]]  # table -> ids the server stored
    rejected: list[RejectedRow]
    conflicts: list[SyncConflict] = Field(default_factory=list)  # server copy wins timestamp conflicts
    postings: dict[str, list[dict]] = Field(default_factory=dict)  # transaction id -> deterministic journal lines


class PullResponse(BaseModel):
    changes: list[PushBatch]
    cursor: str
    has_more: bool = Field(default=False, serialization_alias="hasMore")  # pull again with the new cursor
    reset: bool = False  # server has less than the client already saw: re-upload everything, pull from 0
