from contextlib import asynccontextmanager
from multiprocessing import pool

from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.auth import current_user, is_lender_staff
from app.config import config
from app.db import pool, request_cache
from app.routers import accounting, documents, lender, loan, statements, sync


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    # Load the risk model now (about 2.5 s) rather than on the first Analysis request.
    from app.risk_model import default_model
    default_model()
    print("API docs: http://localhost:8000/docs")
    yield
    pool.close()

app = FastAPI(title="FINEXT API", lifespan=lifespan)

app.include_router(sync.router)
app.include_router(accounting.router)
app.include_router(documents.router)
app.include_router(statements.router)
app.include_router(loan.router)
app.include_router(lender.router)

@app.middleware("http")
async def cache_rows_per_request(request, call_next):
    with request_cache():
        return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    # Only known web front ends may call the API from a browser (the lender portal is same-origin).
    allow_origins=[origin.strip() for origin in config.allowed_origins.split(",") if origin.strip()],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}):8081",
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/me")
def me(user_id: str = Depends(current_user)):
    """Which side of FINEXT this login belongs to: the SME app or the lender portal."""
    return {"role": "lender" if is_lender_staff(user_id) else "sme"}


@app.get("/portal/config.json")
def portal_config():
    """Public settings the lender portal needs to sign bank staff in with Supabase Auth."""
    return {"supabaseUrl": config.supabase_url, "supabasePublishableKey": config.supabase_publishable_key}


# Lender portal (static web app for partner bank staff), same origin as the API.
app.mount("/portal", StaticFiles(directory=Path(__file__).resolve().parent.parent / "portal", html=True), name="portal")
