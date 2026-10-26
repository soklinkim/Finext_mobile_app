"""Notifications for the SME when a partner bank opens or decides on its shared data."""

import logging

from app import loan_store

logger = logging.getLogger(__name__)


def _item(share: dict, event: str, at: int, title: str, body: str, level: str) -> dict:
    # Stable id per share and event, so dismissing one hides it for good.
    return {"id": f"loan-{event}-{share['id']}", "triggerId": f"loan_{event}", "group": "today", "type": "update",
            "title": title, "body": body, "detail": "Analysis › Loan", "at": at, "level": level,
            "values": {"shareId": share["id"], "lender": share["lenderName"]}}


def loan_notifications(user_id: str) -> list[dict]:
    """One notification per milestone (viewed, reviewing, approved, declined), newest first."""
    try:
        shares = loan_store.list_shares_for_sme(user_id)
    except Exception as exc:  # notifications must never break the health report
        logger.warning("Loan notifications unavailable (%s)", type(exc).__name__)
        return []

    items: list[dict] = []
    for share in shares:
        if share["revokedAt"] is not None:
            continue
        bank, note = share["lenderName"], share.get("decisionNote")
        if share.get("firstViewedAt"):
            items.append(_item(share, "viewed", share["firstViewedAt"], f"{bank} opened your report",
                               "They can now see what you shared. You will be notified when they decide.", "green"))
        if share.get("reviewingAt"):
            items.append(_item(share, "reviewing", share["reviewingAt"], f"{bank} is reviewing your application",
                               note or "No action needed for now.", "yellow"))
        if share["decision"] == "approved" and share.get("decidedAt"):
            items.append(_item(share, "approved", share["decidedAt"], f"{bank} approved your application",
                               note or "Contact the bank to continue.", "green"))
        if share["decision"] == "declined" and share.get("decidedAt"):
            items.append(_item(share, "declined", share["decidedAt"], f"{bank} declined your application",
                               note or "Check Loan readiness to see what to improve before applying again.", "red"))
    return sorted(items, key=lambda item: item["at"], reverse=True)
