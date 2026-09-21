# What this changes

<!-- One use case or fix per PR, with its test in the same PR. -->

## Invariant review (all six, every PR)

- [ ] 1. LLM explains, never calculates or decides — no endpoint reachable by the agent records a decision
- [ ] 2. One call, one worker, one case — new tools go through `_run` / `_scoped`
- [ ] 3. Records and allegations never merge
- [ ] 4. Fail closed — `DependencyDown` maps to `dependency_unavailable`, no guessed conclusion
- [ ] 5. Tiers only go up
- [ ] 6. Everything audited, append-only — refusal paths write audit rows too

## Security checklist

- [ ] New tool endpoint uses `agent_auth` and a `Strict` body (`main.py`)
- [ ] `conversation_id` comes from the platform dynamic variable, not the LLM (`agent/tool_configs/`)
- [ ] No new third-party import in domain or data modules (`test_layering.py` green)
- [ ] No PII in log calls
- [ ] Rule parameter changes marked for qualified sign-off (`data/rules.json`)
- [ ] `agent/tool_configs/`, `app/registry.py` and `app/main.py` changed together if a tool changed

## Tests

- [ ] Unit test added/updated in the same PR
- [ ] `make check` green locally
