# Security notes

- Two bearer tokens, never equal: `AGENT_TOOL_TOKEN` (only `/tools/*`) and
  `REVIEWER_TOKEN` (only `/review/*`, `/audit/*`). The agent token cannot
  reach any decision endpoint — enforced in code and tested.
- The ElevenLabs API key exists only server-side to mint signed URLs; the
  browser never sees it.
- Post-call webhook: HMAC-SHA256 over raw bytes, 30-minute replay window,
  constant-time compare, idempotent store.
- `conversation_id` in tool calls is injected by the platform's system
  dynamic variable, never by the LLM.
- Strict input everywhere: Pydantic `extra="forbid"`, regex periods, length
  caps on free text.
- No PII in logs (trace_id, action, result, case_ref only). Secrets via
  environment; startup check refuses to boot incomplete config outside dev.
- Report vulnerabilities privately to the maintainer (see Canvas Box A)
  rather than opening a public issue.
