from datetime import datetime, timezone
from pathlib import PurePath
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile

from app import db
from app.auth import current_sme

router = APIRouter(prefix="/documents", tags=["documents"])

DocumentKind = Literal["patent_tax", "certificate_of_incorporation"]
MAX_BYTES = 5 * 1024 * 1024
# Detect the type from the file's first bytes; the client-supplied content type is not trusted.
SIGNATURES = {
    b"%PDF-": "application/pdf",
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
}


def _detect_type(content: bytes) -> str | None:
    return next((kind for magic, kind in SIGNATURES.items() if content.startswith(magic)), None)


def _clean_file_name(name: str | None, content_type: str) -> str:
    base = PurePath((name or "").replace("\\", "/")).name.strip()[:120]
    if base:
        return base
    return "document." + {"application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png"}[content_type]


@router.get("")
def list_documents(user_id: str = Depends(current_sme)):
    """Uploaded business documents (metadata only)."""
    return {"documents": db.list_documents(user_id)}


@router.put("/{kind}")
async def upload_document(kind: DocumentKind, file: UploadFile = File(...), user_id: str = Depends(current_sme)):
    """Store or replace the user's document of this kind. PDF, JPEG or PNG, up to 5 MB."""
    content = await file.read(MAX_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The file is empty.")
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="The file is larger than 5 MB.")
    content_type = _detect_type(content)
    if content_type is None:
        raise HTTPException(status_code=415, detail="Upload a PDF, JPG or PNG file.")
    file_name = _clean_file_name(file.filename, content_type)
    uploaded_at = int(datetime.now(timezone.utc).timestamp() * 1000)
    db.save_document(user_id, kind, file_name, content_type, content, uploaded_at)
    return {"kind": kind, "fileName": file_name, "contentType": content_type,
            "sizeBytes": len(content), "uploadedAt": uploaded_at}


@router.get("/{kind}/file")
def download_document(kind: DocumentKind, user_id: str = Depends(current_sme)):
    document = db.get_document(user_id, kind)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    file_name, content_type, content = document
    return Response(content, media_type=content_type, headers={
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(file_name)}",
        "X-Content-Type-Options": "nosniff",
    })


@router.delete("/{kind}", status_code=204)
def delete_document(kind: DocumentKind, user_id: str = Depends(current_sme)):
    if not db.delete_document(user_id, kind):
        raise HTTPException(status_code=404, detail="Document not found.")
    return Response(status_code=204)
