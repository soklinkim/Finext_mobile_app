from fastapi.testclient import TestClient

from app.auth import current_user
from app.loan_readiness import ReadinessInputs, assess
from app.main import app
from app.routers import lender as lender_router
from app.routers import loan as loan_router

LENDER_ID = "11111111-1111-1111-1111-111111111111"
SHARE_ID = "22222222-2222-2222-2222-222222222222"


def ratio(rid, status, value=1.0):
    return {"id": rid, "label": rid, "status": status, "value": value, "message": None}


def inputs(**overrides):
    base = dict(
        ratios=[ratio(r, "green") for r in ("dscr", "interest_coverage", "current_ratio", "debt_to_equity",
                                            "debt_to_asset", "net_margin", "gross_margin", "revenue_growth")],
        active_months=6, window_months=6, books_balance=True, days_since_last_entry=3,
        registration_status="registered", documents={"patent_tax", "certificate_of_incorporation"},
    )
    return ReadinessInputs(**{**base, **overrides})


# ------------------------------------------------------------------ scoring

def test_strong_complete_record_is_ready():
    result = assess(inputs())
    assert result["score"] == 100
    assert result["level"] == "ready"
    assert result["coverage"] == 1.0
    assert result["improvements"] == []


def test_new_business_without_data_is_insufficient_not_scored_as_strong():
    result = assess(inputs(
        ratios=[ratio(r, "not_available", None) for r in ("dscr", "current_ratio", "net_margin", "gross_margin", "revenue_growth")],
        active_months=0, days_since_last_entry=None, registration_status=None, documents=set(),
    ))
    assert result["level"] == "insufficient_data"
    assert result["coverage"] < 0.5
    assert "patent_tax" in result["improvements"]


def test_strong_ratios_with_short_history_are_not_enough():
    result = assess(inputs(active_months=2))
    assert result["score"] >= 70
    assert result["level"] == "insufficient_data"


def test_failing_repayment_caps_level_at_almost():
    result = assess(inputs(ratios=[ratio("dscr", "red", 0.8)] + [ratio(r, "green") for r in (
        "interest_coverage", "current_ratio", "debt_to_equity", "debt_to_asset", "net_margin", "gross_margin", "revenue_growth")]))
    assert result["score"] >= 70
    assert result["level"] == "almost"
    assert result["improvements"][0] == "dscr"  # fails first, heaviest pillar first


def test_missing_documents_and_thin_history_lower_the_score():
    result = assess(inputs(active_months=2, documents=set(), registration_status="unregistered"))
    assert result["score"] < 100
    assert {"history", "patent_tax", "certificate_of_incorporation", "registered"} <= set(result["improvements"])


# ------------------------------------------------------------------ access control

class FakeStore:
    def __init__(self):
        self.members = {"bank-staff": {"id": LENDER_ID, "name": "Test Bank"}}
        self.share = {"id": SHARE_ID, "lenderId": LENDER_ID, "lenderName": "Test Bank", "scopes": ["readiness", "trend"],
                      "createdAt": 1, "expiresAt": 10**15, "revokedAt": None, "decision": "new", "decisionNote": None,
                      "decidedAt": None, "readinessScore": 50, "readinessLevel": "almost", "readinessAt": 1}
        self.views = []
        self.upserts = []

    def lender_for_member(self, user_id):
        return self.members.get(user_id)

    def list_applicants(self, lender_id, now):
        return [dict(self.share)] if lender_id == LENDER_ID else []

    def active_share_for_lender(self, lender_id, share_id, now):
        if lender_id == LENDER_ID and str(share_id) == SHARE_ID and self.share["revokedAt"] is None:
            return dict(self.share), "sme-user"
        return None

    def record_view(self, share_id, viewer, now):
        self.views.append(viewer)

    def save_readiness_snapshot(self, *args, **kwargs):
        pass

    def set_decision(self, lender_id, share_id, decision, note, now):
        self.share.update(decision=decision, decisionNote=note)
        return True

    def upsert_share(self, sme, lender_id, scopes, now, expires_at):
        self.upserts.append((sme, lender_id, scopes))
        return {**self.share, "scopes": scopes}


def fake_readiness(user_id):
    return {"score": 50, "level": "almost", "coverage": 0.8, "pillars": [], "checks": [], "improvements": [], "missing": []}


def fake_report(user_id, scopes, readiness):
    report = {"business": {"businessName": "Sokha Mart"}}
    if "readiness" in scopes:
        report["readiness"] = readiness
    if "statements" in scopes:
        report["statements"] = {"income": {}}
    return report


def client_as(monkeypatch, user):
    store = FakeStore()
    monkeypatch.setattr(lender_router, "loan_store", store)
    monkeypatch.setattr(loan_router, "loan_store", store)
    monkeypatch.setattr(lender_router, "readiness_for", fake_readiness)
    monkeypatch.setattr(loan_router, "readiness_for", fake_readiness)
    monkeypatch.setattr(lender_router, "lender_report", fake_report)
    app.dependency_overrides[current_user] = lambda: user
    return TestClient(app), store


def test_ordinary_users_cannot_use_the_lender_api(monkeypatch):
    client, _ = client_as(monkeypatch, "sme-user")
    try:
        assert client.get("/lender/applicants").status_code == 403
        assert client.get(f"/lender/applicants/{SHARE_ID}").status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_lender_sees_only_consented_sections_and_views_are_logged(monkeypatch):
    client, store = client_as(monkeypatch, "bank-staff")
    try:
        body = client.get(f"/lender/applicants/{SHARE_ID}").json()
        assert body["readiness"]["level"] == "almost"
        assert "statements" not in body  # not in the consented scopes
        assert store.views == ["bank-staff"]
        # Documents were not shared, so the file endpoint refuses.
        assert client.get(f"/lender/applicants/{SHARE_ID}/documents/patent_tax").status_code == 403
        assert client.get("/lender/applicants/not-a-uuid").status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_revoked_share_disappears_for_the_lender(monkeypatch):
    client, store = client_as(monkeypatch, "bank-staff")
    try:
        store.share["revokedAt"] = 5
        assert client.get(f"/lender/applicants/{SHARE_ID}").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_score_hidden_from_list_when_readiness_not_shared(monkeypatch):
    client, store = client_as(monkeypatch, "bank-staff")
    try:
        store.share["scopes"] = ["trend"]
        row = client.get("/lender/applicants").json()["applicants"][0]
        assert row["readinessScore"] is None and row["readinessLevel"] is None
    finally:
        app.dependency_overrides.clear()


def test_decision_is_saved(monkeypatch):
    client, store = client_as(monkeypatch, "bank-staff")
    try:
        res = client.put(f"/lender/applicants/{SHARE_ID}/decision", json={"decision": "approved", "note": "  Welcome  "})
        assert res.json() == {"decision": "approved", "decisionNote": "Welcome"}
        assert client.put(f"/lender/applicants/{SHARE_ID}/decision", json={"decision": "maybe"}).status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_sharing_requires_explicit_consent_and_valid_scopes(monkeypatch):
    client, store = client_as(monkeypatch, "sme-user")
    try:
        body = {"lenderId": LENDER_ID, "scopes": ["health", "readiness"], "days": 90}
        assert client.post("/loan/shares", json={**body, "consent": False}).status_code == 400
        assert client.post("/loan/shares", json={**body, "scopes": ["bank_password"], "consent": True}).status_code == 422
        assert client.post("/loan/shares", json={**body, "scopes": [], "consent": True}).status_code == 422
        assert client.post("/loan/shares", json={**body, "days": 9999, "consent": True}).status_code == 422
        res = client.post("/loan/shares", json={**body, "consent": True})
        assert res.status_code == 200
        assert store.upserts[-1][2] == ["readiness", "health"]  # stored in canonical order
    finally:
        app.dependency_overrides.clear()


def test_bank_milestones_become_notifications(monkeypatch):
    from app import loan_notifications as notes

    class Store:
        def list_shares_for_sme(self, user_id):
            base = {"lenderName": "KB PRASAC Bank", "revokedAt": None, "decisionNote": None}
            return [
                {**base, "id": "s1", "firstViewedAt": 100, "reviewingAt": 200, "decision": "approved", "decidedAt": 300,
                 "decisionNote": "Visit a branch"},
                {**base, "id": "s2", "firstViewedAt": None, "reviewingAt": None, "decision": "new", "decidedAt": None},
                {**base, "id": "s3", "firstViewedAt": 50, "reviewingAt": None, "decision": "new", "decidedAt": None, "revokedAt": 60},
            ]

    monkeypatch.setattr(notes, "loan_store", Store())
    items = notes.loan_notifications("sme")
    assert [i["triggerId"] for i in items] == ["loan_approved", "loan_reviewing", "loan_viewed"]  # newest first
    assert items[0]["body"] == "Visit a branch"
    assert all(i["id"].endswith("-s1") for i in items)  # nothing for unviewed or revoked shares


def test_notifications_never_break_when_store_fails(monkeypatch):
    from app import loan_notifications as notes

    class Broken:
        def list_shares_for_sme(self, user_id):
            raise RuntimeError("db down")

    monkeypatch.setattr(notes, "loan_store", Broken())
    assert notes.loan_notifications("sme") == []


def test_bank_staff_are_kept_out_of_the_sme_api(monkeypatch):
    from app import auth
    monkeypatch.setattr(auth, "_membership_cache", {})
    monkeypatch.setattr(loan_router, "loan_store", FakeStore())

    class Members:
        def lender_for_member(self, user_id):
            return {"id": LENDER_ID, "name": "Test Bank"} if user_id == "bank-staff" else None

    import app.loan_store as real_store
    monkeypatch.setattr(real_store, "lender_for_member", Members().lender_for_member)
    client = TestClient(app)
    try:
        app.dependency_overrides[current_user] = lambda: "bank-staff"
        assert client.get("/me").json() == {"role": "lender"}
        res = client.get("/loan/lenders")
        assert res.status_code == 403 and "lender portal" in res.json()["detail"]
        app.dependency_overrides[current_user] = lambda: "sme-user"
        assert client.get("/me").json() == {"role": "sme"}
    finally:
        app.dependency_overrides.clear()
