"""SME side: loan readiness and consent to share data with partner lenders."""

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app import loan_store
from app.auth import current_sme
from app.loan_report import SCOPES, readiness_for

router = APIRouter(prefix="/loan", tags=["loan"])

DAY_MS = 86_400_000
Scope = Literal["readiness", "statements", "health", "trend", "documents"]


def _now() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


class ShareRequest(BaseModel):
    lender_id: UUID = Field(alias="lenderId")
    scopes: list[Scope] = Field(min_length=1)
    days: Literal[30, 90, 180] = 90
    consent: bool


@router.get("/readiness")
def readiness(user_id: str = Depends(current_sme)):
    result = readiness_for(user_id)
    # Keep the score lenders see in their applicant list in step with what the SME sees.
    loan_store.save_readiness_snapshot(user_id, result["score"], result["level"], _now())
    return result


@router.get("/lenders")
def lenders(user_id: str = Depends(current_sme)):
    return {"lenders": loan_store.list_lenders()}


@router.get("/shares")
def shares(user_id: str = Depends(current_sme)):
    now = _now()
    return {"shares": [{**share, "active": share["revokedAt"] is None and share["expiresAt"] > now}
                       for share in loan_store.list_shares_for_sme(user_id)]}


@router.post("/shares")
def share(req: ShareRequest, user_id: str = Depends(current_sme)):
    """Give (or update) consent for one lender to see the chosen data until it expires or is revoked."""
    if not req.consent:
        raise HTTPException(status_code=400, detail="Consent is required to share your data.")
    now = _now()
    scopes = [scope for scope in SCOPES if scope in req.scopes]
    created = loan_store.upsert_share(user_id, str(req.lender_id), scopes, now, now + req.days * DAY_MS)
    if created is None:
        raise HTTPException(status_code=404, detail="This bank is not available.")
    result = readiness_for(user_id)
    loan_store.save_readiness_snapshot(user_id, result["score"], result["level"], now, created["id"])
    return {**created, "readinessScore": result["score"], "readinessLevel": result["level"], "readinessAt": now, "active": True}


class OfferResponse(BaseModel):
    response: Literal["accepted", "declined"]
    note: str | None = Field(default=None, max_length=1000)
    # When the offer being answered was made (its decidedAt), so a changed offer is not accepted unseen.
    offer_decided_at: int | None = Field(default=None, alias="offerDecidedAt")


@router.put("/shares/{share_id}/response")
def respond(share_id: UUID, req: OfferResponse, user_id: str = Depends(current_sme)):
    """Accept or decline the loan a bank offered. Answered once: the bank then sees it and its decision is final."""
    note = (req.note or "").strip() or None
    result = loan_store.respond_to_offer(user_id, str(share_id), req.response, note, _now(), req.offer_decided_at)
    if result == "changed":
        raise HTTPException(status_code=409, detail="The bank changed its offer. Check the new offer before you answer.")
    if result != "saved":
        raise HTTPException(status_code=409, detail="There is no open offer to answer for this bank.")
    return {"smeResponse": req.response, "smeResponseNote": note}


@router.delete("/shares/{share_id}", status_code=204)
def revoke(share_id: UUID, user_id: str = Depends(current_sme)):
    if not loan_store.revoke_share(user_id, share_id, _now()):
        raise HTTPException(status_code=404, detail="Share not found or already revoked.")
    return Response(status_code=204)
