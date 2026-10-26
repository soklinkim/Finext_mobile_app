from fastapi.testclient import TestClient

from app.auth import current_user
from app.main import app
from app.routers import documents as documents_router

PDF = b"%PDF-1.7\n%test document\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


class MemoryDocuments:
    def __init__(self):
        self.rows = {}

    def list_documents(self, user_id):
        return [{"kind": kind, "fileName": name, "contentType": ctype, "sizeBytes": len(content), "uploadedAt": at}
                for (owner, kind), (name, ctype, content, at) in sorted(self.rows.items()) if owner == user_id]

    def get_document(self, user_id, kind):
        row = self.rows.get((user_id, kind))
        return row[:3] if row else None

    def save_document(self, user_id, kind, file_name, content_type, content, uploaded_at):
        self.rows[(user_id, kind)] = (file_name, content_type, content, uploaded_at)

    def delete_document(self, user_id, kind):
        return self.rows.pop((user_id, kind), None) is not None


def _client(monkeypatch, user="user-a"):
    store = MemoryDocuments()
    monkeypatch.setattr(documents_router, "db", store)
    app.dependency_overrides[current_user] = lambda: user
    return TestClient(app), store


def test_upload_list_download_replace_and_delete(monkeypatch):
    client, store = _client(monkeypatch)
    try:
        res = client.put("/documents/patent_tax", files={"file": ("C:\\scans\\patent.pdf", PDF, "application/pdf")})
        assert res.status_code == 200
        assert res.json()["fileName"] == "patent.pdf"
        assert res.json()["contentType"] == "application/pdf"

        listed = client.get("/documents").json()["documents"]
        assert [d["kind"] for d in listed] == ["patent_tax"]

        download = client.get("/documents/patent_tax/file")
        assert download.status_code == 200
        assert download.content == PDF
        assert download.headers["content-type"] == "application/pdf"

        # Uploading again replaces the stored file; the type comes from the bytes, not the client.
        res = client.put("/documents/patent_tax", files={"file": ("photo.png", PNG, "application/pdf")})
        assert res.json()["contentType"] == "image/png"
        assert len(store.rows) == 1

        assert client.delete("/documents/patent_tax").status_code == 204
        assert client.get("/documents/patent_tax/file").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_rejects_unknown_kind_wrong_type_empty_and_oversized_files(monkeypatch):
    client, store = _client(monkeypatch)
    try:
        assert client.put("/documents/passport", files={"file": ("a.pdf", PDF, "application/pdf")}).status_code == 422
        assert client.put("/documents/patent_tax", files={"file": ("a.exe", b"MZ\x90\x00", "application/pdf")}).status_code == 415
        assert client.put("/documents/patent_tax", files={"file": ("a.pdf", b"", "application/pdf")}).status_code == 400
        big = PDF + b"0" * documents_router.MAX_BYTES
        assert client.put("/documents/certificate_of_incorporation", files={"file": ("big.pdf", big, "application/pdf")}).status_code == 413
        assert store.rows == {}
    finally:
        app.dependency_overrides.clear()


def test_documents_are_scoped_to_the_signed_in_user(monkeypatch):
    client, store = _client(monkeypatch, user="user-a")
    try:
        client.put("/documents/certificate_of_incorporation", files={"file": ("c.pdf", PDF, "application/pdf")})
        app.dependency_overrides[current_user] = lambda: "user-b"
        assert client.get("/documents").json()["documents"] == []
        assert client.get("/documents/certificate_of_incorporation/file").status_code == 404
    finally:
        app.dependency_overrides.clear()
