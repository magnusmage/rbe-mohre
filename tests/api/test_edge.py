"""Edge behaviour: 401 without a token, 422 on extra fields, webhook
signature, 409 on locked decisions, 502 on upstream failure. Pytest-style
(needs FastAPI installed); the domain suite runs with unittest alone.
"""
import json

import httpx
import respx
from fastapi.testclient import TestClient

from app.main import app
from app.signature import sign
from app.settings import settings

client = TestClient(app)

def _get_http_log(captured: str, path: str) -> dict:
    """Return the latest structured HTTP log for the given path."""
    for line in reversed(captured.splitlines()):
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue

        if event.get("path") == path:
            return event

    raise AssertionError(f"No structured HTTP log found for {path}")


def test_health_and_data_mode():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["data_mode"] == "synthetic"
    assert r.headers["X-Data-Mode"] == "synthetic"
    assert r.headers["X-Trace-Id"]
    

def test_structured_logging_generates_trace_id(capsys):
    r = client.get("/health")

    assert r.status_code == 200
    assert r.headers.get("X-Trace-Id")

    event = _get_http_log(
        capsys.readouterr().out,
        "/health",
    )

    assert set(event) == {"trace_id", "path", "status", "ms"}
    assert event["trace_id"] == r.headers["X-Trace-Id"]
    assert event["path"] == "/health"
    assert event["status"] == 200
    assert isinstance(event["ms"], (int, float))
    assert event["ms"] >= 0


def test_structured_logging_propagates_trace_id(capsys):
    trace_id = "test-trace-123"

    r = client.get(
        "/health",
        headers={"X-Trace-Id": trace_id},
    )

    assert r.status_code == 200
    assert r.headers["X-Trace-Id"] == trace_id

    event = _get_http_log(
        capsys.readouterr().out,
        "/health",
    )

    assert event["trace_id"] == trace_id


def test_structured_logging_records_error_status(capsys):
    r = client.post("/tools/check_wage", json={
        "conversation_id": "abcd",
        "case_ref": "LAB-1001",
        "period": "2026-07",
    })

    assert r.status_code == 401

    event = _get_http_log(
        capsys.readouterr().out,
        "/tools/check_wage",
    )

    assert event["path"] == "/tools/check_wage"
    assert event["status"] == 401
    assert event["trace_id"] == r.headers["X-Trace-Id"]


def test_structured_logging_does_not_log_pii(capsys):
    conversation_id = "CONVERSATION-PII-SENTINEL"
    worker_id = "WORKER-PII-SENTINEL"
    case_ref = "CASE-PII-SENTINEL"
    pin = "987654"

    r = client.post(
        "/tools/verify_session",
        json={
            "conversation_id": conversation_id,
            "worker_id": worker_id,
            "case_ref": case_ref,
            "pin": pin,
        },
    )

    assert r.status_code == 401

    captured = capsys.readouterr().out
    event = _get_http_log(captured, "/tools/verify_session")

    assert set(event) == {"trace_id", "path", "status", "ms"}

    assert conversation_id not in captured
    assert worker_id not in captured
    assert case_ref not in captured
    assert pin not in captured


def test_tool_needs_agent_token():
    r = client.post("/tools/check_wage", json={
        "conversation_id": "abcd", "case_ref": "LAB-1001", "period": "2026-07"})
    assert r.status_code == 401


def test_reviewer_token_is_not_agent_token(agent_headers):
    assert client.get("/review/queue", headers=agent_headers).status_code == 401


def test_extra_field_rejected(agent_headers):
    body = {"conversation_id": "abcd", "case_ref": "LAB-1001",
            "period": "2026-07", "worker_id": "WRK-1002"}
    r = client.post("/tools/check_wage", json=body, headers=agent_headers)
    assert r.status_code == 422


def test_full_call_flow_over_http(agent_headers, reviewer_headers):
    conv = "http-e2e-01"
    r = client.post("/tools/verify_session", headers=agent_headers, json={
        "conversation_id": conv, "worker_id": "WRK-1001",
        "case_ref": "LAB-1001", "pin": "4821"})
    assert r.json()["ok"]
    r = client.post("/tools/check_wage", headers=agent_headers, json={
        "conversation_id": conv, "case_ref": "LAB-1001", "period": "2026-07"})
    assert r.json()["findings"][0]["amount"] == "1000.00"
    r = client.post("/tools/send_to_review", headers=agent_headers, json={
        "conversation_id": conv, "case_ref": "LAB-1001",
        "tier": "tier_0_standard_review", "summary": "July shortfall"})
    review_ref = r.json()["review_ref"]

    # decision locked until the HMAC-verified transcript arrives
    r = client.post(f"/review/{review_ref}/decision", headers=reviewer_headers,
                    json={"decision": "open_complaint", "reviewer": "sp-1"})
    assert r.status_code == 409 and r.json()["detail"] == "transcript_pending"

    raw = json.dumps({"data": {"conversation_id": conv}}).encode()
    assert client.post("/webhooks/elevenlabs/post-call", content=raw, headers={
        "elevenlabs-signature": "t=1,v0=bad"}).status_code == 401
    r = client.post("/webhooks/elevenlabs/post-call", content=raw, headers={
        "elevenlabs-signature": sign(raw, settings.elevenlabs_webhook_secret)})
    assert r.json()["ok"]

    r = client.post(f"/review/{review_ref}/decision", headers=reviewer_headers,
                    json={"decision": "open_complaint", "reviewer": "sp-1"})
    assert r.json()["ok"]
    r = client.post(f"/review/{review_ref}/decision", headers=reviewer_headers,
                    json={"decision": "refer", "reviewer": "sp-2"})
    assert r.status_code == 409 and r.json()["detail"] == "already_decided"

    events = client.get("/audit/LAB-1001", headers=reviewer_headers).json()["events"]
    assert any(e["action"] == "decision" for e in events)


@respx.mock
def test_signed_url_upstream_failure():
    respx.get("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url").mock(
        return_value=httpx.Response(500))
    assert client.get("/session/signed-url").status_code == 502
