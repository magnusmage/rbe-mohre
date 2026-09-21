# D6 — Business refusals are HTTP 200 with ok:false and a say sentence

**Status:** accepted

Tool endpoints return `{ok: false, error, say}` for business refusals
(scope violation, missing evidence, dependency down). HTTP 4xx is reserved
for authentication and malformed input.

**Why.** The voice agent must speak a reviewed, safe sentence instead of
hitting a platform error. Legal-boundary wording lives in code, reviewed in
PRs — never improvised by the model.
