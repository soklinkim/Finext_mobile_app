"""Builds an SME's loan readiness and the consented report a lender may see."""

from datetime import datetime, timezone

from fastapi import HTTPException

from app import db
from app.loan_readiness import ReadinessInputs, assess
from app.routers import accounting

SCOPES = ("readiness", "statements", "health", "trend", "documents")


def _settings(user_id: str) -> dict:
    return next((row for row in db.get_table_rows(user_id, "settings") if row.get("id") == "app"), {})


def readiness_for(user_id: str) -> dict:
    """Readiness for one SME from its server-side records (the same data reports use)."""
    books_balance = not accounting._validation_issues(user_id)
    ratios: list[dict] = []
    if books_balance:
        try:
            ratios = accounting.ratios(user_id)["ratios"]
            report = accounting.statements(user_id, period="monthly")
            books_balance = report["balance"]["check"]["difference"] == 0 and report["cashflow"]["check"]["difference"] == 0
        except HTTPException:
            books_balance = False

    trend = accounting.forecast(user_id)
    transactions = db.get_table_rows(user_id, "transactions")
    last_entry = max((tx["occurredAt"] for tx in transactions), default=None)
    now_ms = datetime.now(timezone.utc).timestamp() * 1000
    days_since = None if last_entry is None else max(0, int((now_ms - last_entry) // 86_400_000))

    result = assess(ReadinessInputs(
        ratios=ratios,
        active_months=trend["activeMonths"],
        window_months=trend["readiness"]["windowMonths"],
        books_balance=books_balance,
        days_since_last_entry=days_since,
        registration_status=_settings(user_id).get("registrationStatus"),
        documents={doc["kind"] for doc in db.list_documents(user_id)},
    ))
    result["currency"] = trend["currency"]
    return result


def business_profile(user_id: str) -> dict:
    """Identity and contact details; always included so the lender knows who is applying."""
    s = _settings(user_id)
    keys = ("businessName", "businessIndustry", "location", "registrationStatus", "registrationNumber",
            "startOperationDate", "ownerName", "ownerEmail", "ownerPhone", "mainProducts")
    return {key: s.get(key) for key in keys}


def lender_report(user_id: str, scopes: list[str], readiness: dict | None) -> dict:
    """Only the parts the SME consented to. Sections that can't be produced say why instead of failing the page."""
    report: dict = {"business": business_profile(user_id)}
    if "readiness" in scopes:
        report["readiness"] = readiness
    if "statements" in scopes:
        try:
            full = accounting.statements(user_id, period="monthly")
            report["statements"] = {key: full[key] for key in ("period", "income", "balance", "cashflow")}
        except HTTPException as exc:
            report["statements"] = {"error": "The business's records have entries that need fixing before statements can be produced.",
                                    "detail": exc.detail}
    if "health" in scopes:
        try:
            report["health"] = accounting.ratios(user_id)
        except HTTPException:
            report["health"] = {"error": "Financial health ratios are unavailable until the business fixes some entries."}
    if "trend" in scopes:
        trend = accounting.forecast(user_id)
        report["trend"] = {key: trend[key] for key in ("currency", "history", "activeMonths", "basicAnalysis")}
    if "documents" in scopes:
        report["documents"] = db.list_documents(user_id)
    return report
