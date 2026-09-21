"""HMAC-SHA256 verification for the ElevenLabs post-call webhook (C9).

Verify against the RAW request bytes, before JSON parsing: parsing and
re-serialising changes whitespace and breaks the signature. Header format:
``ElevenLabs-Signature: t=<unix>,v0=<hex>``. 30-minute replay tolerance.
"""
from __future__ import annotations

import hashlib
import hmac
import time


class BadSignature(Exception):
    """Raised with a short reason: missing | malformed | stale | mismatch."""


def verify(header: str, raw_body: bytes, secret: str,
           tolerance_s: int = 1800, now: float | None = None) -> None:
    if not header or not secret:
        raise BadSignature("missing")
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    try:
        ts, sig = int(parts["t"]), parts["v0"]
    except (KeyError, ValueError):
        raise BadSignature("malformed") from None
    now = time.time() if now is None else now
    if abs(now - ts) > tolerance_s:                        # replay window
        raise BadSignature("stale")
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + raw_body,
                        hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):             # constant-time
        raise BadSignature("mismatch")


def sign(raw_body: bytes, secret: str, now: float | None = None) -> str:
    """Produce a valid header — used by tests only."""
    ts = int(time.time() if now is None else now)
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + raw_body,
                   hashlib.sha256).hexdigest()
    return f"t={ts},v0={sig}"
