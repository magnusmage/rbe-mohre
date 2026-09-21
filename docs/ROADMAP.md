# Phase roadmap

The repo is structured so each phase is additive: nothing built in an
earlier phase is rewritten, only extended behind existing seams
(adapter Protocols, Store method names, agent config folder).

## Phase 1: Stage 1 submission (23 Sep 2026)

Idea Canvas + proof of build: this repository public, control plane running
(`/health`, `/docs`), domain test suite green, `agent/` config reviewed.
**Definition of done:** repo URL and walkthrough video filled into Canvas
Boxes A and Q; tag `stage1-2026-09-23`.

## Phase 2: Build sprint (30 Sep to 14 Oct 2026)

- Wire the agent live: ElevenLabs agent configured from `agent/` (CLI push),
  tunnel or container host for tools + webhook, first end-to-end web call.
- Sprint fixes tracked as issues: structlog middleware, property tests
  (hypothesis), API test expansion, locust run at 2x annualised 80084 volume,
  CI hardening (mypy gate, full ruff ruleset, coverage floor 80 to 85),
  verify the pinned @elevenlabs/client version against npm.
- Agent Testing S1-S10, five runs each; record evaluation table
  (case success >=90%, S5 tool-correctness 100%, 0 ungrounded amounts,
  0 advice breaches, tier-2 recall 100%).
- Demo assets: UC-11/01 core call, UC-13 settlement, UC-14 rule change,
  UC-15 or UC-07 guardrail under pressure.
**Definition of done:** tag `stage2-2026-10-14`; demo reproducible from tag.

## Phase 3: Demo Day (26-27 Oct 2026)

Polish only: latency numbers from platform analytics, load report,
walkthrough of the zone map and human gate. No new features after 19 Oct.

## Phase 4: Pilot path (post-challenge, with MoHRE)

- `app/live/` adapters: read-only REST/MCP over mTLS to contract records and
  WPS (C6/C7); complaint submission after `open_complaint` via queued worker
  (C8, arq + Redis).
- Store on Postgres (sqlalchemy/alembic) behind the same method names;
  stateless replicas.
- Identity: UAE PASS / MoHRE OTP replaces the synthetic one-time code.
- Channel: 80084 over SIP/Twilio (C13); specialist SSO (JWT) replaces the
  reviewer token.
- Governance: qualified sign-off on every `rules.json` version; in-country
  hosting for the control plane; LLM-hosting decision with MoHRE.
