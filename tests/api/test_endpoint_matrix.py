"""Complete authentication and validation matrix for the public API.

Issue #9 requires every protected route to distinguish an unknown or missing
credential (401) from a valid credential for the wrong role (403). It also
requires strict request bodies, strict periods, both review decision conflicts,
and every post-call signature refusal path.
"""
from __future__ import annotations

import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.settings import settings
from app.signature import sign

client = TestClient(app)


TOOL_ROUTES = [
    "/tools/verify_session",
    "/tools/check_wage",
    "/tools/check_payment_timing",
    "/tools/check_settlement",
    "/tools/record_allegation",
    "/tools/draft_complaint",
    "/tools/send_to_review",
    "/tools/transfer_to_human",
]

REVIEW_ROUTES = [
    ("GET", "/review/queue"),
    ("GET", "/review/RV-NOT-FOUND"),
    ("POST", "/review/RV-NOT-FOUND/decision"),
    ("GET", "/audit/LAB-1001"),
]

STRICT_BODIES = [
    ("/tools/verify_session", {
        "conversation_id": "matrix-verify",
        "worker_id": "WRK-1001",
        "case_ref": "LAB-1001",
        "pin": "4821",
    }),
    ("/tools/check_wage", {
        "conversation_id": "matrix-wage",
        "case_ref": "LAB-1001",
        "period": "2026-07",
    }),
    ("/tools/check_payment_timing", {
        "conversation_id": "matrix-timing",
        "case_ref": "LAB-1001",
        "period": "2026-07",
    }),
    ("/tools/check_settlement", {
        "conversation_id": "matrix-settlement",
        "case_ref": "LAB-1001",
    }),
    ("/tools/record_allegation", {
        "conversation_id": "matrix-allegation",
        "case_ref": "LAB-1001",
        "period": "2026-07",
        "statement": "The deduction was not authorised.",
    }),
    ("/tools/draft_complaint", {
        "conversation_id": "matrix-draft",
        "case_ref": "LAB-1001",
        "summary": "July wage shortfall",
        "worker_confirmed": True,
    }),
    ("/tools/send_to_review", {
        "conversation_id": "matrix-review",
        "case_ref": "LAB-1001",
        "tier": "tier_0_standard_review",
        "summary": "July wage shortfall",
    }),
    ("/tools/transfer_to_human", {
        "conversation_id": "matrix-transfer",
        "reason": "Worker requested a person.",
    }),
]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _conversation(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex}"


def _create_review(agent_headers: dict[str, str]) -> tuple[str, str]:
    conversation_id = _conversation("matrix-decision")
    verify = client.post("/tools/verify_session", headers=agent_headers, json={
        "conversation_id": conversation_id,
        "worker_id": "WRK-1001",
        "case_ref": "LAB-1001",
        "pin": "4821",
    })
    assert verify.status_code == 200 and verify.json()["ok"] is True

    queued = client.post("/tools/send_to_review", headers=agent_headers, json={
        "conversation_id": conversation_id,
        "case_ref": "LAB-1001",
        "tier": "tier_0_standard_review",
        "summary": "Endpoint matrix decision test",
    })
    assert queued.status_code == 200 and queued.json()["ok"] is True
    return conversation_id, queued.json()["review_ref"]


def _store_transcript(conversation_id: str) -> None:
    raw = json.dumps({"data": {"conversation_id": conversation_id}}).encode()
    response = client.post(
        "/webhooks/elevenlabs/post-call",
        content=raw,
        headers={
            "elevenlabs-signature": sign(raw, settings.elevenlabs_webhook_secret),
        },
    )
    assert response.status_code == 200


@pytest.mark.parametrize("path", TOOL_ROUTES)
@pytest.mark.parametrize("headers", [None, _auth("unknown-token")], ids=["missing", "wrong"])
def test_tool_routes_reject_unknown_or_missing_credentials(path, headers):
    response = client.post(path, headers=headers, json={})
    assert response.status_code == 401


@pytest.mark.parametrize("path", TOOL_ROUTES)
def test_tool_routes_forbid_reviewer_credentials(path, reviewer_headers):
    response = client.post(path, headers=reviewer_headers, json={})
    assert response.status_code == 403
    assert response.json()["detail"] == "forbidden"


@pytest.mark.parametrize("method,path", REVIEW_ROUTES)
@pytest.mark.parametrize("headers", [None, _auth("unknown-token")], ids=["missing", "wrong"])
def test_reviewer_routes_reject_unknown_or_missing_credentials(method, path, headers):
    response = client.request(method, path, headers=headers, json={})
    assert response.status_code == 401


@pytest.mark.parametrize("method,path", REVIEW_ROUTES)
def test_reviewer_routes_forbid_agent_credentials(method, path, agent_headers):
    response = client.request(method, path, headers=agent_headers, json={})
    assert response.status_code == 403
    assert response.json()["detail"] == "forbidden"


@pytest.mark.parametrize("path,body", STRICT_BODIES, ids=[
    "verify_session",
    "check_wage",
    "check_payment_timing",
    "check_settlement",
    "record_allegation",
    "draft_complaint",
    "send_to_review",
    "transfer_to_human",
])
def test_tool_routes_reject_extra_fields(path, body, agent_headers):
    response = client.post(
        path,
        headers=agent_headers,
        json={**body, "unexpected": "must be rejected"},
    )
    assert response.status_code == 422
    assert any(error["type"] == "extra_forbidden" for error in response.json()["detail"])


def test_decision_route_rejects_extra_fields(reviewer_headers):
    response = client.post(
        "/review/RV-NOT-FOUND/decision",
        headers=reviewer_headers,
        json={
            "decision": "refer",
            "reviewer": "matrix-reviewer",
            "unexpected": "must be rejected",
        },
    )
    assert response.status_code == 422
    assert any(error["type"] == "extra_forbidden" for error in response.json()["detail"])


@pytest.mark.parametrize("path", [
    "/tools/check_wage",
    "/tools/check_payment_timing",
    "/tools/record_allegation",
])
@pytest.mark.parametrize("period", ["2026-13", "2026-7", "July 2026"])
def test_period_routes_reject_malformed_periods(path, period, agent_headers):
    body = {
        "conversation_id": "matrix-period",
        "case_ref": "LAB-1001",
        "period": period,
    }
    if path.endswith("record_allegation"):
        body["statement"] = "The deduction was not authorised."

    response = client.post(path, headers=agent_headers, json=body)
    assert response.status_code == 422
    assert any(error["type"] == "string_pattern_mismatch"
               for error in response.json()["detail"])


def test_decision_returns_409_while_transcript_is_pending(
    agent_headers,
    reviewer_headers,
):
    _, review_ref = _create_review(agent_headers)
    response = client.post(
        f"/review/{review_ref}/decision",
        headers=reviewer_headers,
        json={"decision": "refer", "reviewer": "matrix-reviewer"},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "transcript_pending"


def test_decision_returns_409_after_review_is_decided(agent_headers, reviewer_headers):
    conversation_id, review_ref = _create_review(agent_headers)
    _store_transcript(conversation_id)

    first = client.post(
        f"/review/{review_ref}/decision",
        headers=reviewer_headers,
        json={"decision": "refer", "reviewer": "matrix-reviewer"},
    )
    assert first.status_code == 200 and first.json()["ok"] is True

    second = client.post(
        f"/review/{review_ref}/decision",
        headers=reviewer_headers,
        json={"decision": "request_more", "reviewer": "other-reviewer"},
    )
    assert second.status_code == 409
    assert second.json()["detail"] == "already_decided"


@pytest.mark.parametrize(("signature", "detail"), [
    (None, "signature_missing"),
    ("not-a-signature", "signature_malformed"),
    ("t=1,v0=bad", "signature_stale"),
    (f"t={int(time.time())},v0=bad", "signature_mismatch"),
])
def test_webhook_rejects_each_invalid_signature_path(signature, detail):
    raw = json.dumps({"data": {"conversation_id": _conversation("matrix-webhook")}}).encode()
    headers = {"elevenlabs-signature": signature} if signature is not None else {}

    response = client.post(
        "/webhooks/elevenlabs/post-call",
        content=raw,
        headers=headers,
    )
    assert response.status_code == 401
    assert response.json()["detail"] == detail


def test_all_tool_routes_accept_valid_contracts(agent_headers):
    """Exercise every tool route through authentication and body validation."""
    conversation_id = _conversation("matrix-tools")
    bodies = {
        "/tools/verify_session": {
            "conversation_id": conversation_id,
            "worker_id": "WRK-1001",
            "case_ref": "LAB-1001",
            "pin": "4821",
        },
        "/tools/check_wage": {
            "conversation_id": conversation_id,
            "case_ref": "LAB-1001",
            "period": "2026-07",
        },
        "/tools/check_payment_timing": {
            "conversation_id": conversation_id,
            "case_ref": "LAB-1001",
            "period": "2026-07",
        },
        "/tools/check_settlement": {
            "conversation_id": conversation_id,
            "case_ref": "LAB-1001",
        },
        "/tools/record_allegation": {
            "conversation_id": conversation_id,
            "case_ref": "LAB-1001",
            "period": "2026-07",
            "statement": "The deduction was not authorised.",
        },
        "/tools/draft_complaint": {
            "conversation_id": conversation_id,
            "case_ref": "LAB-1001",
            "summary": "July wage shortfall",
            "worker_confirmed": True,
        },
        "/tools/send_to_review": {
            "conversation_id": conversation_id,
            "case_ref": "LAB-1001",
            "tier": "tier_0_standard_review",
            "summary": "July wage shortfall",
        },
        "/tools/transfer_to_human": {
            "conversation_id": conversation_id,
            "reason": "Worker requested a person.",
        },
    }

    for path in TOOL_ROUTES:
        response = client.post(path, headers=agent_headers, json=bodies[path])
        assert response.status_code == 200, (path, response.text)


def test_reviewer_read_routes_accept_reviewer_credentials(
    agent_headers,
    reviewer_headers,
):
    _, review_ref = _create_review(agent_headers)

    queue = client.get("/review/queue", headers=reviewer_headers)
    assert queue.status_code == 200
    assert any(item["review_ref"] == review_ref for item in queue.json()["items"])

    detail = client.get(f"/review/{review_ref}", headers=reviewer_headers)
    assert detail.status_code == 200
    assert detail.json()["review"]["review_ref"] == review_ref

    audit = client.get("/audit/LAB-1001", headers=reviewer_headers)
    assert audit.status_code == 200
    assert isinstance(audit.json()["events"], list)
