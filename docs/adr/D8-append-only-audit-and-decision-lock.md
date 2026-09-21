# D8 — Append-only audit by trigger; decisions locked on transcript

**Status:** accepted

`audit_event` refuses UPDATE and DELETE at the database level. Every tool
call, refusal, webhook and decision writes a row in the same code path as
the action. A specialist decision is refused (409) until the HMAC-verified
post-call transcript is stored, and each review item is decided exactly
once.

**Why.** The audit log is the evidence behind every guardrail claim; the
transcript lock means no human decides on a case they cannot read back.
