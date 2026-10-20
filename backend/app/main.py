from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import sync

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("API docs: http://localhost:8000/docs")
    yield

app = FastAPI(title="FINEXT API", lifespan=lifespan)

app.include_router(sync.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev only; tighten before deploying
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}