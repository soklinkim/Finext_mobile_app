import logging

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jwt import PyJWKClient
from app.config import config

bearer = HTTPBearer()
_jwks = PyJWKClient(f"{config.supabase_url}/auth/v1/.well-known/jwks.json")
logger = logging.getLogger(__name__)


def current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> str:
    try:
        key = _jwks.get_signing_key_from_jwt(creds.credentials).key
        # leeway: a fresh token is "issued in the future" if this computer's clock runs a little behind Supabase's.
        payload = jwt.decode(creds.credentials, key,
                             algorithms=["ES256", "RS256"], audience="authenticated", leeway=60)
        return payload["sub"]
    except Exception as exc:
        # Log only the exception class; never write the user's bearer token to logs.
        logger.warning("Supabase access token rejected (%s)", type(exc).__name__)
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ---------------------------------------------------------------- SME vs partner-bank accounts

_MEMBERSHIP_TTL_S = 300
_membership_cache: dict[str, tuple[bool, float]] = {}


def is_lender_staff(user_id: str) -> bool:
    """Whether this login belongs to partner-bank staff (cached for a few minutes)."""
    import time

    from app import loan_store

    cached = _membership_cache.get(user_id)
    if cached and cached[1] > time.monotonic():
        return cached[0]
    try:
        member = loan_store.lender_for_member(user_id) is not None
    except Exception as exc:  # the SME data is still scoped to this user, so fail open
        logger.warning("Lender membership check unavailable (%s)", type(exc).__name__)
        return False
    _membership_cache[user_id] = (member, time.monotonic() + _MEMBERSHIP_TTL_S)
    return member


def current_sme(user_id: str = Depends(current_user)) -> str:
    """The signed-in business owner. Partner-bank staff use the lender portal, not the SME app."""
    if is_lender_staff(user_id):
        raise HTTPException(status_code=403, detail="This is a partner bank account. Sign in to the lender portal instead.")
    return user_id
