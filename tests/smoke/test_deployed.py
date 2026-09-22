"""Read-only smoke tests against a DEPLOYED instance, the pytest twin of
deploy/smoke_test.sh. Skipped unless RBE_SMOKE_URL is set, so local and CI
runs are unaffected:

    RBE_SMOKE_URL=https://rbe.magnusmage.com python -m pytest tests/smoke -v

No token is used and nothing is written; the checks assert the public
contract only (health, docs, the synthetic-data marker, fail-closed auth,
and the SPA shell when served through nginx).
"""
import os

import httpx
import pytest

BASE = os.environ.get("RBE_SMOKE_URL", "").rstrip("/")

pytestmark = pytest.mark.skipif(not BASE, reason="RBE_SMOKE_URL not set")


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=BASE, timeout=15, follow_redirects=True) as c:
        yield c


def test_health_ok_and_synthetic(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.headers.get("x-data-mode") == "synthetic"
    body = r.json()
    assert body["status"] == "ok"
    assert body["data_mode"] == "synthetic"


def test_docs_and_openapi(client):
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


def test_tools_fail_closed_without_token(client):
    assert client.post("/tools/check_wage", json={}).status_code == 401
    r = client.post("/tools/check_wage", json={},
                    headers={"authorization": "Bearer wrong"})
    assert r.status_code == 401


def test_reviewer_endpoint_fails_closed(client):
    assert client.get("/review/queue").status_code == 401


def test_webhook_rejects_unsigned(client):
    r = client.post("/webhooks/elevenlabs/post-call", json={})
    assert r.status_code == 401


def test_spa_shell_served(client):
    """Only meaningful behind nginx; the bare backend serves its own page."""
    r = client.get("/")
    assert r.status_code == 200
    if "RBE Console" in r.text:
        deep = client.get("/caller/ready")
        assert deep.status_code == 200
        assert "RBE Console" in deep.text
