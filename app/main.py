"""The edge: authentication, strict input contracts, routes, signed URL,
post-call webhook. No business logic here: it authenticates, validates and
delegates, which is why it stays thin (EDGE layer; the only modules allowed
to import FastAPI / Pydantic / httpx).
"""
from __future__ import annotations

import hmac
import json
import time
from collections import defaultdict, deque
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from . import service as svc
from .settings import settings
from .signature import BadSignature, verify
from .store import Store

DATA = Path(__file__).resolve().parent.parent / "data"
TEMPLATES = Path(__file__).resolve().parent / "templates"
WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"

app = FastAPI(title="RBE control plane", version="0.1.0",
              description="Resolve Before It Escalates: MoHRE control plane (Zone 3). "
                          "Synthetic data only; information, not legal advice.")

settings.check()
store = Store(settings.database_path,
              workers={w["worker_id"]: w
                       for w in json.loads((DATA / "workers.json").read_text())},
              rules=json.loads((DATA / "rules.json").read_text()))


# ------------------------------------------------------------------- auth

def _bearer(expected: str):
    def dep(authorization: str = Header(default="")):
        if not expected or not hmac.compare_digest(authorization, f"Bearer {expected}"):
            raise HTTPException(401, "unauthorised")
    return dep


agent_auth = Depends(_bearer(settings.agent_tool_token))       # /tools/* only
reviewer_auth = Depends(_bearer(settings.reviewer_token))      # /review/*, /audit/* only


@app.middleware("http")
async def data_mode(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Data-Mode"] = "synthetic"
    return resp


# ---------------------------------------------------------- strict bodies

class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")                  # unknown fields -> 422
    conversation_id: str = Field(min_length=4, max_length=128)


class VerifyIn(Strict):
    worker_id: str = Field(max_length=32)
    case_ref: str = Field(max_length=32)
    pin: str = Field(max_length=16)


class CaseIn(Strict):
    case_ref: str = Field(max_length=32)


class PeriodIn(CaseIn):
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class AllegationIn(PeriodIn):
    statement: str = Field(max_length=300)


class DraftIn(CaseIn):
    summary: str = Field(max_length=1000)
    worker_confirmed: bool


class ReviewIn(CaseIn):
    tier: str = Field(max_length=40)
    summary: str = Field(max_length=1000)


class TransferIn(Strict):
    reason: str = Field(max_length=200)
    callback: bool = False
    consent: bool = False


class DecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: str = Field(max_length=40)
    reviewer: str = Field(max_length=64)


# ------------------------------------------------------------ agent tools

@app.post("/tools/verify_session", dependencies=[agent_auth])
def t_verify(b: VerifyIn):
    return svc.verify_session(store, b.conversation_id, b.worker_id, b.case_ref, b.pin)


@app.post("/tools/check_wage", dependencies=[agent_auth])
def t_wage(b: PeriodIn):
    return svc.check_wage(store, b.conversation_id, b.case_ref, b.period)


@app.post("/tools/check_payment_timing", dependencies=[agent_auth])
def t_timing(b: PeriodIn):
    return svc.check_payment_timing(store, b.conversation_id, b.case_ref, b.period)


@app.post("/tools/check_settlement", dependencies=[agent_auth])
def t_settlement(b: CaseIn):
    return svc.check_settlement(store, b.conversation_id, b.case_ref)


@app.post("/tools/record_allegation", dependencies=[agent_auth])
def t_allegation(b: AllegationIn):
    return svc.record_allegation(store, b.conversation_id, b.case_ref, b.period, b.statement)


@app.post("/tools/draft_complaint", dependencies=[agent_auth])
def t_draft(b: DraftIn):
    return svc.draft_complaint(store, b.conversation_id, b.case_ref, b.summary,
                               b.worker_confirmed)


@app.post("/tools/send_to_review", dependencies=[agent_auth])
def t_review(b: ReviewIn):
    return svc.send_to_review(store, b.conversation_id, b.case_ref, b.tier, b.summary)


@app.post("/tools/transfer_to_human", dependencies=[agent_auth])
def t_transfer(b: TransferIn):
    return svc.transfer_to_human(store, b.conversation_id, b.reason, b.callback, b.consent)


# -------------------------------------------------------------- signed URL

_RATE: dict[str, deque] = defaultdict(deque)          # naive per-IP limiter


def _rate_limited(ip: str, limit: int = 10, window_s: int = 60) -> bool:
    q = _RATE[ip]
    now = time.time()
    while q and now - q[0] > window_s:
        q.popleft()
    if len(q) >= limit:
        return True
    q.append(now)
    return False


@app.get("/session/signed-url")
async def signed_url(request: Request):
    if _rate_limited(request.client.host if request.client else "unknown"):
        raise HTTPException(429, "rate_limited")
    async with httpx.AsyncClient(timeout=5) as c:
        r = await c.get("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
                        params={"agent_id": settings.elevenlabs_agent_id},
                        headers={"xi-api-key": settings.elevenlabs_api_key})
    if r.status_code != 200:
        raise HTTPException(502, "signed_url_unavailable")
    return {"signed_url": r.json()["signed_url"]}


# ----------------------------------------------------------------- webhook

@app.post("/webhooks/elevenlabs/post-call")
async def post_call(request: Request):
    raw = await request.body()                                  # raw bytes, before parsing
    try:
        verify(request.headers.get("elevenlabs-signature", ""), raw,
               settings.elevenlabs_webhook_secret)
    except BadSignature as e:
        raise HTTPException(401, f"signature_{e}")
    body = json.loads(raw)
    conv = body.get("data", {}).get("conversation_id")
    if not conv:
        raise HTTPException(422, "no_conversation_id")
    stored = store.save_transcript(conv, body)                  # idempotent
    store.audit("system", "post_call_webhook", "stored" if stored else "duplicate", conv)
    return {"ok": True}


# -------------------------------------------------------------- specialist

@app.get("/review/queue", dependencies=[reviewer_auth])
def queue():
    items = store.queue()
    for it in items:
        it["transcript_ready"] = store.has_transcript(it["conversation_id"])
        it.pop("package_json", None)
    return {"items": items}


@app.post("/review/{review_ref}/decision", dependencies=[reviewer_auth])
def decision(review_ref: str, b: DecisionIn):
    out = svc.decide(store, review_ref, b.decision, b.reviewer)
    if not out["ok"]:
        code = {"not_found": 404, "transcript_pending": 409,
                "already_decided": 409}.get(out["error"], 422)
        raise HTTPException(code, out["error"])
    return out


@app.get("/audit/{case_ref}", dependencies=[reviewer_auth])
def audit(case_ref: str):
    return {"events": store.audit_for(case_ref)}


# ------------------------------------------------------------------- pages
# The web console (web/dist, D10) is the only caller UI and is served by
# the edge, so a reverse proxy that forwards everything still shows it.
# A checkout without a build gets build instructions, never an old page.

if (WEB_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

_BUILD_MISSING = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>RBE</title></head><body style="font-family:system-ui;max-width:560px;margin:48px auto">
<h1>Console build missing</h1>
<p>The web console has not been built in this checkout. Run:</p>
<pre>cd web &amp;&amp; npm ci &amp;&amp; npm run build</pre>
<p>then reload. API health: <a href="/health">/health</a>, docs: <a href="/docs">/docs</a>.</p>
</body></html>"""


def _console() -> str | None:
    index = WEB_DIST / "index.html"
    return index.read_text() if index.is_file() else None


@app.get("/", response_class=HTMLResponse)
def home_page():
    return _console() or _BUILD_MISSING


@app.get("/favicon.svg", include_in_schema=False)
def favicon():
    icon = WEB_DIST / "favicon.svg"
    if icon.is_file():
        return FileResponse(icon)
    raise HTTPException(404)


@app.get("/caller/{_rest:path}", response_class=HTMLResponse, include_in_schema=False)
@app.get("/specialist/{_rest:path}", response_class=HTMLResponse, include_in_schema=False)
def console_routes(_rest: str = ""):
    """Client-side routes of the console; 404 when no build is present."""
    page = _console()
    if page is None:
        raise HTTPException(404)
    return page


@app.get("/review", response_class=HTMLResponse)
def review_page():
    return (TEMPLATES / "review.html").read_text()


@app.get("/health")
def health():
    return JSONResponse({"status": "ok", "data_mode": "synthetic",
                         "workers_loaded": len(store.workers),
                         "rules_loaded": bool(store.rules)})
