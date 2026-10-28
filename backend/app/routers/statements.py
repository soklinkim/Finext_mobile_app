"""Bank statement import: read an uploaded statement PDF into rows for the owner to review (nothing is stored)."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.auth import current_sme
from app.statement_import import MAX_BYTES, StatementError, read_statement

router = APIRouter(prefix="/import", tags=["import"])

STATUS = {"too_large": 413, "not_pdf": 415, "no_table": 422}


@router.post("/statement")
def import_statement(file: UploadFile = File(...), password: str | None = Form(None), user_id: str = Depends(current_sme)):
    """Read a bank statement PDF (up to 10 MB). Returns its rows and checks; the app saves only what the owner confirms.
    A plain function, so FastAPI runs the reading (CPU work) in its thread pool rather than on the event loop."""
    content = file.file.read(MAX_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail={"code": "empty", "message": "The file is empty."})
    try:
        return read_statement(content, password)
    except StatementError as exc:
        raise HTTPException(status_code=STATUS.get(exc.code, 400), detail={"code": exc.code, "message": str(exc)}) from exc
