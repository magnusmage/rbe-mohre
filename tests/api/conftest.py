"""Edge tests need tokens set BEFORE app.settings is imported."""
import os

os.environ.setdefault("APP_ENV", "dev")
os.environ.setdefault("DATABASE_PATH", ":memory:")
os.environ.setdefault("AGENT_TOOL_TOKEN", "test-agent-token")
os.environ.setdefault("REVIEWER_TOKEN", "test-reviewer-token")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-xi-key")
os.environ.setdefault("ELEVENLABS_AGENT_ID", "test-agent-id")
os.environ.setdefault("ELEVENLABS_WEBHOOK_SECRET", "test-webhook-secret")

import pytest  # noqa: E402


@pytest.fixture
def agent_headers():
    return {"Authorization": f"Bearer {os.environ['AGENT_TOOL_TOKEN']}"}


@pytest.fixture
def reviewer_headers():
    return {"Authorization": f"Bearer {os.environ['REVIEWER_TOKEN']}"}
