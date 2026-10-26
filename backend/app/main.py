from contextlib import asynccontextmanager
from multiprocessing import pool

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import config
from app.db import pool, request_cache
from app.routers import accounting, documents, lender, loan, sync


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    print("API docs: http://localhost:8000/docs")
    yield
    pool.close()

app = FastAPI(title="FINEXT API", lifespan=lifespan)

app.include_router(sync.router)
app.include_router(accounting.router)
app.include_router(documents.router)
app.include_router(loan.router)
app.include_router(lender.router)

@app.middleware("http")
async def cache_rows_per_request(request, call_next):
    with request_cache():
        return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev only; tighten before deploying
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/portal/config.json")
def portal_config():
    """Public settings the lender portal needs to sign bank staff in with Supabase Auth."""
    return {"supabaseUrl": config.supabase_url, "supabasePublishableKey": config.supabase_publishable_key}


# Lender portal (static web app for partner bank staff), same origin as the API.
app.mount("/portal", StaticFiles(directory=Path(__file__).resolve().parent.parent / "portal", html=True), name="portal")
