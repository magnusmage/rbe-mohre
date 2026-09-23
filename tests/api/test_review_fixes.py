"""Tests for the Stage 1 review fixes (issues #31-#35): idempotent
send_to_review, reviewer detail access, audited decision refusals, the
bearer scheme keeping the 401 contract, and verified findings built only
from record-backed check results, never from allegations or workflow
metadata.
"""
import json

from fastapi.testclient import TestClient

from app.main import app, store
from app.settings import settings
from app.signature import sign

client = TestClient(app)


def _verify(conv, agent_headers):
    r = client.post("/tools/verify_session", headers=agent_headers, json={
        "conversation_id": conv, "worker_id": "WRK-1001",
        "case_ref": "LAB-1001", "pin": "4821"})
    assert r.json()["ok"]


def _store_transcript(conv):
    raw = json.dumps({"data": {"conversation_id": conv}}).encode()
    r = client.post("/webhooks/elevenlabs/post-call", content=raw, headers={
        "elevenlabs-signature": sign(raw, settings.elevenlabs_webhook_secret)})
    assert r.json()["ok"]


def test_bearer_scheme_keeps_401_contract():
    """#34 regression guard: missing, malformed and wrong credentials all
    stay 401 after the switch to the OpenAPI bearer scheme."""
    assert client.post("/tools/check_wage", json={}).status_code == 401
    assert client.post("/tools/check_wage", json={}, headers={
        "Authorization": "Basic abc"}).status_code == 401
    assert client.post("/tools/check_wage", json={}, headers={
        "Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/review/RV-0000-0000").status_code == 401


def test_send_to_review_deduplicates_active_case(agent_headers):
    """#31: a second send_to_review for the same call and case is refused
    while a review is still open, and the refusal is audited."""
    conv = "pr36-idem-01"
    _verify(conv, agent_headers)
    body = {"conversation_id": conv, "case_ref": "LAB-1001",
            "tier": "tier_0_standard_review", "summary": "first"}
    first = client.post("/tools/send_to_review", headers=agent_headers, json=body).json()
    assert first["ok"]

    second = client.post("/tools/send_to_review", headers=agent_headers,
                         json={**body, "summary": "second"}).json()
    assert second["ok"] is False and second["error"] == "already_queued"
    assert second["say"]                                   # reviewed sentence, not silence

    events = store.audit_for("LAB-1001")
    assert any(e["action"] == "send_to_review" and e["result"] == "already_queued"
               and e["conversation_id"] == conv for e in events)


def test_refused_decisions_are_audited(agent_headers, reviewer_headers):
    """#33: transcript_pending and already_decided refusals write audit
    rows, not just HTTP errors (invariant 6)."""
    conv = "pr36-audit-01"
    _verify(conv, agent_headers)
    r = client.post("/tools/send_to_review", headers=agent_headers, json={
        "conversation_id": conv, "case_ref": "LAB-1001",
        "tier": "tier_0_standard_review", "summary": "audit path"}).json()
    review_ref = r["review_ref"]

    r = client.post(f"/review/{review_ref}/decision", headers=reviewer_headers,
                    json={"decision": "refer", "reviewer": "sp-1"})
    assert r.status_code == 409

    _store_transcript(conv)
    assert client.post(f"/review/{review_ref}/decision", headers=reviewer_headers,
                       json={"decision": "refer", "reviewer": "sp-1"}).json()["ok"]
    r = client.post(f"/review/{review_ref}/decision", headers=reviewer_headers,
                    json={"decision": "uphold", "reviewer": "sp-2"})
    assert r.status_code == 409

    results = [e["result"] for e in store.audit_for("LAB-1001")
               if e["action"] == "decision" and e["conversation_id"] == conv]
    assert "transcript_pending" in results
    assert "already_decided" in results
    assert "refer" in results


def test_review_detail_needs_reviewer_token(agent_headers, reviewer_headers):
    """#32: the detail endpoint exists, is reviewer-only, and carries the
    evidence a decision needs (package, transcript state, audit trail)."""
    conv = "pr36-detail-01"
    _verify(conv, agent_headers)
    r = client.post("/tools/send_to_review", headers=agent_headers, json={
        "conversation_id": conv, "case_ref": "LAB-1001",
        "tier": "tier_0_standard_review", "summary": "detail"}).json()
    review_ref = r["review_ref"]

    assert client.get(f"/review/{review_ref}", headers=agent_headers).status_code == 401
    assert client.get("/review/RV-0000-0000",
                      headers=reviewer_headers).status_code == 404

    d = client.get(f"/review/{review_ref}", headers=reviewer_headers).json()
    assert d["ok"] and d["review"]["review_ref"] == review_ref
    assert d["review"]["transcript_ready"] is False
    assert "package" in d and "audit" in d and "allegations" in d

    _store_transcript(conv)
    d = client.get(f"/review/{review_ref}", headers=reviewer_headers).json()
    assert d["review"]["transcript_ready"] is True
    assert d["transcript"] is not None


def test_draft_verified_findings_are_record_backed_only(agent_headers):
    """#35: verified_findings come from record checks with verified=True
    findings; the caller's allegation stays in allegations only
    (invariant 3), and workflow metadata never leaks in."""
    conv = "pr36-draft-01"
    _verify(conv, agent_headers)
    r = client.post("/tools/check_wage", headers=agent_headers, json={
        "conversation_id": conv, "case_ref": "LAB-1001", "period": "2026-07"}).json()
    assert r["ok"]
    r = client.post("/tools/record_allegation", headers=agent_headers, json={
        "conversation_id": conv, "case_ref": "LAB-1001", "period": "2026-07",
        "statement": "The deduction was not my fault."}).json()
    assert r["ok"]
    r = client.post("/tools/draft_complaint", headers=agent_headers, json={
        "conversation_id": conv, "case_ref": "LAB-1001",
        "summary": "July shortfall", "worker_confirmed": True}).json()
    assert r["ok"]

    body = store.latest_draft("LAB-1001")["body"]
    vf = body["verified_findings"]
    assert vf, "record-backed checks must produce verified findings"
    for entry in vf:
        assert entry["action"] in {"check_wage", "check_payment_timing",
                                   "check_settlement", "record_allegation"}
        assert entry["findings"], "no empty evidence entries"
        for f in entry["findings"]:
            assert f["verified"] is True
            assert f["source"] != "CALLER-STATEMENT"
        # workflow metadata must not masquerade as findings
        assert "review_ref" not in entry and "reason" not in entry

    assert body["allegations"], "the allegation is kept, separately"
    assert body["filed"] is False
