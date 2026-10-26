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
        payload = jwt.decode(creds.credentials, key,
                             algorithms=["ES256", "RS256"], audience="authenticated")
        return payload["sub"]
    except Exception as exc:
        # Log only the exception class; never write the user's bearer token to logs.
        logger.warning("Supabase access token rejected (%s)", type(exc).__name__)
        raise HTTPException(status_code=401, detail="Invalid or expired token")
