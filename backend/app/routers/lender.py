"""Lender portal API: bank staff see only SMEs that consented to share with their bank."""

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app import db, loan_store
from app.auth import current_user
from app.loan_report import lender_report, readiness_for

router = APIRouter(prefix="/lender", tags=["lender"])

DocumentKind = Literal["patent_tax", "certificate_of_incorporation"]


def _now() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def current_lender(user_id: str = Depends(current_user)) -> dict:
    """The signed-in user's bank. Ordinary app users are refused."""
    lender = loan_store.lender_for_member(user_id)
    if lender is None:
        raise HTTPException(status_code=403, detail="This account is not set up for a partner bank.")
    return {**lender, "userId": user_id}


def _active_share(lender: dict, share_id: str) -> tuple[dict, str]:
    found = loan_store.active_share_for_lender(lender["id"], share_id, _now())
    if found is None:
        # Revoked, expired, another bank's, or never existed: all look the same to the caller.
        raise HTTPException(status_code=404, detail="This applicant is not sharing data with your bank.")
    return found


class DecisionRequest(BaseModel):
    decision: Literal["reviewing", "approved", "declined"]
    note: str | None = Field(default=None, max_length=1000)


@router.get("/me")
def me(lender: dict = Depends(current_lender)):
    return {"lender": {"id": lender["id"], "name": lender["name"]}}


@router.get("/applicants")
def applicants(lender: dict = Depends(current_lender)):
    rows = loan_store.list_applicants(lender["id"], _now())
    for row in rows:
        # The score is only shown where the SME consented to share readiness.
        if "readiness" not in row["scopes"]:
            row["readinessScore"] = row["readinessLevel"] = row["readinessAt"] = None
    return {"applicants": rows}


@router.get("/applicants/{share_id}")
def applicant(share_id: UUID, lender: dict = Depends(current_lender)):
    share, sme_user_id = _active_share(lender, share_id)
    now = _now()
    readiness = readiness_for(sme_user_id) if "readiness" in share["scopes"] else None
    if readiness is not None:
        loan_store.save_readiness_snapshot(sme_user_id, readiness["score"], readiness["level"], now, share_id)
    loan_store.record_view(share_id, lender["userId"], now)
    return {"share": share, **lender_report(sme_user_id, share["scopes"], readiness)}


@router.get("/applicants/{share_id}/documents/{kind}")
def applicant_document(share_id: UUID, kind: DocumentKind, lender: dict = Depends(current_lender)):
    share, sme_user_id = _active_share(lender, share_id)
    if "documents" not in share["scopes"]:
        raise HTTPException(status_code=403, detail="The business has not shared its documents with your bank.")
    document = db.get_document(sme_user_id, kind)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    file_name, content_type, content = document
    loan_store.record_view(share_id, lender["userId"], _now())
    return Response(content, media_type=content_type, headers={
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(file_name)}",
        "X-Content-Type-Options": "nosniff",
    })


@router.put("/applicants/{share_id}/decision")
def decide(share_id: UUID, req: DecisionRequest, lender: dict = Depends(current_lender)):
    _active_share(lender, share_id)
    note = (req.note or "").strip() or None
    loan_store.set_decision(lender["id"], share_id, req.decision, note, _now())
    return {"decision": req.decision, "decisionNote": note}
