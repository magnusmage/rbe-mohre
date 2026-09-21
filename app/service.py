"""The eight agent tools and the specialist decision.

DOMAIN layer, standard library only. Every tool follows one pattern:
normalise, check scope, check the dependency, run a pure rule, audit, return.
The pattern lives in ``_run`` so a new tool cannot forget a step.

Guarantees carried here:
- invariant 2: one call, one worker, one case (``_scoped``)
- invariant 4: fail closed on DependencyDown (``dependency_unavailable``)
- invariant 5: tiers only go up (``send_to_review`` floor)
- invariant 6: every call and every refusal writes an audit row
- the human gate: ``decide`` refuses until the transcript is stored, and
  each review item is decided once.

Record reads go through the adapter Protocols (C6/C7), never through the
fixture dict directly, so a live read-only API in the pilot is a new adapter
class, not a change here.
"""
from __future__ import annotations

import json

from . import rules
from .adapters import DependencyDown, SyntheticContracts, SyntheticWPS
from .normalise import PERIOD, normalise_ref
from .registry import DECISIONS
from .store import Store


class ScopeError(Exception):
    def __init__(self, code: str, say: str):
        self.code, self.say = code, say
        super().__init__(code)


# ------------------------------------------------------------- composition

def _adapters(store: Store):
    """Adapters are attached at composition (main.py / tests). Default:
    synthetic adapters over the fixture set."""
    if not hasattr(store, "contracts"):
        store.contracts = SyntheticContracts(store.workers)
    if not hasattr(store, "wps"):
        store.wps = SyntheticWPS(store.workers)
    return store.contracts, store.wps


def _load_worker(store: Store, worker_id: str) -> dict:
    contracts, wps = _adapters(store)
    worker = dict(contracts.contract(worker_id))
    worker["wps"] = wps.lines(worker_id)
    return worker


# ---------------------------------------------------------------- pattern

def _refuse(store: Store, conv: str, action: str, code: str, say: str,
            case_ref: str | None = None) -> dict:
    store.audit("agent", action, code, conv, case_ref)      # refusals audited too
    return {"ok": False, "error": code, "say": say}


def _scoped(store: Store, conv: str, case_ref: str) -> str:
    s = store.session(conv)
    if s is None or not s["verified"]:
        raise ScopeError("session_not_verified", "I need to verify you first.")
    if s["case_ref"] != case_ref:
        raise ScopeError("case_scope_violation",
                         "I can only discuss your own verified case on this call.")
    return s["worker_id"]


def _run(store: Store, conv: str, action: str, case_ref: str, fn) -> dict:
    ref = normalise_ref(case_ref)
    try:
        worker_id = _scoped(store, conv, ref)
        worker = _load_worker(store, worker_id)
    except ScopeError as e:
        return _refuse(store, conv, action, e.code, e.say, ref)
    except DependencyDown:
        return _refuse(store, conv, action, "dependency_unavailable",
                       "I can't reach the records right now, so I won't give an answer "
                       "I can't check. I can pass you to a person or arrange a callback.", ref)
    res = fn(worker)                                        # pure rule from rules.py
    store.audit("agent", action, res.status, conv, ref,
                {"tier": res.tier.value, "rules": [f.rule_id for f in res.findings]})
    return {"ok": True, **res.to_dict()}


# ------------------------------------------------------------ tool 1: verify

def verify_session(store: Store, conv: str, worker_id: str, case_ref: str, pin: str) -> dict:
    wid, ref, code = normalise_ref(worker_id), normalise_ref(case_ref), normalise_ref(pin)
    store.start_session(conv)
    s = store.session(conv)
    if s["locked"]:
        return _refuse(store, conv, "verify_session", "verification_locked",
                       "I can't verify you on this call. Please try the MoHRE app "
                       "or call again.", ref)
    if s["verified"]:
        if s["case_ref"] == ref:
            store.audit("agent", "verify_session", "already_bound", conv, ref)
            return {"ok": True, "worker_id": s["worker_id"], "case_ref": ref}
        return _refuse(store, conv, "verify_session", "already_verified",
                       "This call is already linked to one case. For a second case, "
                       "please make a new call.", ref)
    try:
        contracts, _ = _adapters(store)
        contract = contracts.contract(wid) if wid in store.workers else None
    except DependencyDown:
        return _refuse(store, conv, "verify_session", "dependency_unavailable",
                       "I can't reach the records right now, so I can't verify you. "
                       "Please try again shortly.", ref)
    if contract and contract["case_ref"] == ref and str(contract["pin"]) == code:
        store.bind(conv, wid, ref)
        store.audit("agent", "verify_session", "verified", conv, ref)
        return {"ok": True, "worker_id": wid, "case_ref": ref}
    attempts = store.fail_attempt(conv)
    if attempts >= 2:
        return _refuse(store, conv, "verify_session", "verification_locked",
                       "That didn't match, and I have to stop here. Please try the "
                       "MoHRE app or call again.", ref)
    return _refuse(store, conv, "verify_session", "verification_failed",
                   "That didn't match. Let's try once more: your worker ID, case "
                   "reference and one-time code.", ref)


# --------------------------------------------------------- tools 2-5: checks

def check_wage(store: Store, conv: str, case_ref: str, period: str) -> dict:
    period = normalise_ref(period)
    if not PERIOD.match(period):
        return _refuse(store, conv, "check_wage", "invalid_period",
                       "Which month? For example, July 2026.")
    return _run(store, conv, "check_wage", case_ref,
                lambda w: rules.wage_check(w, period, store.rules))


def check_payment_timing(store: Store, conv: str, case_ref: str, period: str) -> dict:
    period = normalise_ref(period)
    if not PERIOD.match(period):
        return _refuse(store, conv, "check_payment_timing", "invalid_period",
                       "Which month? For example, July 2026.")
    return _run(store, conv, "check_payment_timing", case_ref,
                lambda w: rules.timing_check(w, period, store.rules))


def check_settlement(store: Store, conv: str, case_ref: str) -> dict:
    return _run(store, conv, "check_settlement", case_ref,
                lambda w: rules.settlement_check(w, store.rules))


def record_allegation(store: Store, conv: str, case_ref: str, period: str,
                      statement: str) -> dict:
    period = normalise_ref(period)
    if not PERIOD.match(period):
        return _refuse(store, conv, "record_allegation", "invalid_period",
                       "Which month is this about? For example, July 2026.")
    out = _run(store, conv, "record_allegation", case_ref,
               lambda w: rules.allegation_result(w, period, statement, store.rules))
    if out.get("ok") and out.get("check") == "allegation":
        store.add_allegation(normalise_ref(case_ref), period, statement)
    return out


# ------------------------------------------------------- tools 6-8: casework

def draft_complaint(store: Store, conv: str, case_ref: str, summary: str,
                    worker_confirmed: bool) -> dict:
    ref = normalise_ref(case_ref)
    try:
        _scoped(store, conv, ref)
    except ScopeError as e:
        return _refuse(store, conv, "draft_complaint", e.code, e.say, ref)
    if not worker_confirmed:
        return _refuse(store, conv, "draft_complaint", "not_confirmed",
                       "I'll only prepare a draft if you confirm you want one. "
                       "Shall I prepare it?", ref)
    body = {"summary": summary[:1000],
            "allegations": store.allegations(ref),
            "verified_findings": [json.loads(r["detail"]) for r in store.audit_for(ref)
                                  if r["conversation_id"] == conv and r["detail"]],
            "filed": False}                     # never filed in the build
    draft_ref = store.create_draft(ref, body, True)
    store.audit("agent", "draft_complaint", "drafted", conv, ref, {"draft_ref": draft_ref})
    return {"ok": True, "draft_ref": draft_ref, "filed": False,
            "say": "I've prepared the draft. Nothing is filed: a specialist will "
                   "review it first."}


def send_to_review(store: Store, conv: str, case_ref: str, tier: str, summary: str) -> dict:
    ref = normalise_ref(case_ref)
    try:
        _scoped(store, conv, ref)
    except ScopeError as e:
        return _refuse(store, conv, "send_to_review", e.code, e.say, ref)
    try:
        req = rules.Tier(tier)
    except ValueError:
        return _refuse(store, conv, "send_to_review", "invalid_tier",
                       "I couldn't queue that. Let me pass you to a person.", ref)
    # floor = highest tier any check produced on this call (invariant 5)
    seen = []
    for r in store.audit_for(ref):
        if r["conversation_id"] == conv and r["detail"]:
            d = json.loads(r["detail"])
            if "tier" in d:
                seen.append(rules.Tier(d["tier"]))
    final = max([req] + seen, key=lambda t: rules.TIER_ORDER[t])
    review_ref = store.create_review(ref, conv, final.value, summary[:1000],
                                     {"allegations": store.allegations(ref)})
    store.audit("agent", "send_to_review", "queued", conv, ref,
                {"review_ref": review_ref, "tier": final.value})
    return {"ok": True, "review_ref": review_ref, "tier": final.value,
            "say": "A specialist will review this. Every case is looked at by a person."}


def transfer_to_human(store: Store, conv: str, reason: str,
                      callback: bool = False, consent: bool = False) -> dict:
    store.start_session(conv)
    s = store.session(conv)
    ref = s.get("case_ref") if s else None
    if callback and not consent:
        return _refuse(store, conv, "transfer_to_human", "callback_without_consent",
                       "I can only arrange a callback with your consent. Shall I "
                       "transfer you now instead?", ref)
    if callback:
        store.set_callback_consent(conv, True)
    mode = "callback" if callback else "transfer"
    store.audit("agent", "transfer_to_human", mode, conv, ref, {"reason": reason[:200]})
    return {"ok": True, "mode": mode,
            "say": "I'm arranging a callback from our team." if callback
            else "I'm transferring you to a person now."}


# ---------------------------------------------------- specialist only: decide

def decide(store: Store, review_ref: str, decision: str, reviewer: str) -> dict:
    it = store.review(review_ref)
    if it is None:
        return {"ok": False, "error": "not_found"}
    if it["decision"]:
        return {"ok": False, "error": "already_decided"}
    if decision not in DECISIONS:
        return {"ok": False, "error": "invalid_decision"}
    if not store.has_transcript(it["conversation_id"]):
        return {"ok": False, "error": "transcript_pending"}      # decision lock
    store.decide(review_ref, decision, reviewer)
    store.audit("reviewer", "decision", decision, it["conversation_id"], it["case_ref"],
                {"review_ref": review_ref})
    return {"ok": True, "decision": decision}
