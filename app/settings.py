"""Frozen settings from the environment. No LLM or embedding settings: the
LLM is configured in the ElevenLabs Agents Platform (Zone 2), never here.
Outside dev, missing secrets fail at boot, not mid-call.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_env: str = os.getenv("APP_ENV", "dev")
    database_path: str = os.getenv("DATABASE_PATH", "rbe.db")
    agent_tool_token: str = os.getenv("AGENT_TOOL_TOKEN", "")
    reviewer_token: str = os.getenv("REVIEWER_TOKEN", "")
    elevenlabs_api_key: str = os.getenv("ELEVENLABS_API_KEY", "")   # signed URLs only
    elevenlabs_agent_id: str = os.getenv("ELEVENLABS_AGENT_ID", "")
    elevenlabs_webhook_secret: str = os.getenv("ELEVENLABS_WEBHOOK_SECRET", "")

    def check(self) -> None:                                        # call at startup
        if self.app_env != "dev":
            missing = [k for k, v in vars(self).items() if v == ""]
            if missing:
                raise RuntimeError(f"missing settings: {missing}")
            if self.agent_tool_token == self.reviewer_token:
                raise RuntimeError("agent and reviewer tokens must differ")


settings = Settings()
