# Contributing

RBE is built for collaboration between the core team and reviewers from the
ElevenLabs challenge. This file is the workflow contract; docs/architecture.md
and the ADRs in docs/adr/ are the architecture contract.

## The six invariants

Every pull request is reviewed against these. Each has at least one test;
never remove a test that guards an invariant.

1. **The LLM explains; it never calculates or decides.**
2. **One call, one worker, one case.**
3. **Records and allegations never merge.**
4. **Fail closed.**
5. **Tiers only go up.**
6. **Everything is audited, append-only.**

## Where to start, by role

| If you work on | You own | Never touch without review |
|---|---|---|
| Voice & agent behaviour | `agent/` | Tool names & schemas (the Zone 3 contract) |
| Rules & calculations | `app/rules.py`, `data/rules.json` | Any rule parameter without qualified sign-off |
| Control plane & API | `app/service.py`, `app/main.py`, `app/store.py` | Scope check, tier floor, decision lock |
| MoHRE integration | `app/adapters.py`, `app/live/` (pilot) | Field minimisation lists |
| Specialist UI | `app/templates/review.html` | Decision buttons stay locked until transcript stored |
| Testing & evaluation | `tests/`, `load/`, `agent/test_configs/` | Removing an invariant-guarding test |

## Git workflow

- Short-lived branches: `uc-13-settlement`, `fix/store-lock`.
- One PR per use case or fix, **with its test in the same PR**.
- CI must be green before merge (`ruff`, `mypy`, unittest, pytest+coverage,
  agent-config validation).
- Tag every build submitted to the challenge (`stage1-2026-09-23`,
  `stage2-2026-10-14`) so demos reproduce exactly.

## Adding a new check: the seven steps

1. Parameters into `data/rules.json`, marked for sign-off.
2. Pure rule in `app/rules.py`: scope first, `needs_evidence` when data is
   missing, Decimal maths, a `Finding` with rule ID and source, reviewed `say`.
3. Unit test first, against a new fixture in `data/workers.json`.
4. Tool in `app/service.py` through `_run`.
5. Route in `app/main.py` with `agent_auth` and a `Strict` body.
6. Register in `app/registry.py` **and** `agent/tool_configs/` +
   `agent/tools.json` (the `PlatformContract` test fails until they agree).
7. Agent Testing scenario in `agent/test_configs/`.

## Conventions

- Money through `rules.money()`; amounts cross JSON as strings.
- ISO date strings at the boundary, `datetime.date` inside; rules selected
  by due date, never "today".
- Every worker-audible sentence is a `say` string in code, reviewed in PRs.
- No PII in logs: trace_id, action, result, case_ref only.
- Environment-only config; startup check outside dev.

## Setup

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m unittest -v        # domain suite: no network, no ElevenLabs account
make check                   # lint + types + full pytest
```
