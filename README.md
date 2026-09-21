# Resolve Before It Escalates (RBE)

A voice agent for MoHRE worker-rights checks. A worker calls about pay, a
deduction, payment timing or an exit settlement; the agent checks the
question against **that worker's own contract, WPS record and the rule in
force for that month**, explains the result in their language (Arabic,
English, Urdu), and prepares a complaint draft or passes the case to a
qualified specialist. It gives information, never legal advice, and never
decides anything.

> **Synthetic data only.** Every response carries `X-Data-Mode: synthetic`.
> Rule-matching logic requires qualified sign-off before any launch.

Built for the Ignyte × ElevenLabs Future of Voice AI Challenge 2026 —
Track 2, Government Services · Rights Checks & Dispute Prevention.

## Architecture in one paragraph

Four zones split by trust boundary. **Zone 1** (caller): a web page with the
ElevenLabs Web SDK on a short-lived signed URL. **Zone 2** (ElevenLabs
platform): Scribe v2 STT, Agents Platform + Workflows (five nodes,
per-node tool scoping), Eleven v3 TTS, Knowledge Base of public rule texts —
*configured, not coded*, from the [`agent/`](agent/) folder. **Zone 3** (this
control plane): FastAPI at the edge, standard-library Python inside — scope
enforcement, Decimal arithmetic on effective-dated rules, allegation/record
separation, tiering, specialist queue, append-only audit. **No LLM anywhere
in Zone 3.** **Zone 4**: existing MoHRE systems, reached read-only through
adapter Protocols (synthetic in the build). Every case ends at the **human
gate**: a specialist with a separate token decides, and only after the
HMAC-verified call transcript is stored.

### Six invariants (every PR is reviewed against them)

1. The LLM explains; it never calculates or decides.
2. One call, one worker, one case.
3. Records and allegations never merge.
4. Fail closed.
5. Tiers only go up.
6. Everything is audited, append-only.

## Repository layout

```
rbe/
├── app/                 Zone 3 control plane
│   ├── main.py          EDGE   tokens, strict Pydantic bodies, routes, signed URL, webhook
│   ├── settings.py      EDGE   frozen env config; fail fast outside dev
│   ├── signature.py     EDGE   HMAC-SHA256 + timestamp for the post-call webhook
│   ├── normalise.py     EDGE   Arabic-Indic & Urdu digits, ID and period patterns
│   ├── service.py       DOMAIN the 8 agent tools + specialist decision; scope, audit
│   ├── rules.py         DOMAIN wage / timing / gratuity / scope; Decimal; effective-dated
│   ├── registry.py      DOMAIN node→tool map; reviewer-only actions
│   ├── quality.py       DOMAIN post-call grounding check
│   ├── store.py         DATA   sqlite3 now, Postgres later; append-only audit triggers
│   ├── adapters.py      DATA   Protocols to MoHRE systems; synthetic implementations
│   └── templates/       call page (Web SDK) + specialist review queue
├── agent/               Zone 2 source of truth — ElevenLabs Agents-CLI layout
├── data/                synthetic fixtures (one per use case) + effective-dated rules
├── tests/               28 domain tests (stdlib, no network) + api/ edge tests
├── load/                locust: tool endpoints at 2× annualised 80084 volume
├── docs/adr/            architecture decisions D1–D9 · docs/ROADMAP.md phases
└── .github/             CI (lint, types, tests, coverage, agent-config), CODEOWNERS, PR template
```

Layering rule (enforced by `tests/test_layering.py`): DOMAIN and DATA import
the **standard library only** — no FastAPI, no Pydantic, no httpx, no LLM
SDKs. The whole domain suite runs in milliseconds with no network.

## Run it

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt

python -m unittest -v            # 28 tests; no network, no ElevenLabs account
make run                         # then open /health and /docs
cp .env.example .env             # tokens: python -c "import secrets;print(secrets.token_urlsafe(32))"
```

To go live end-to-end (build sprint): expose the app over HTTPS
(`cloudflared tunnel --url http://localhost:8000`), configure the ElevenLabs
agent from [`agent/`](agent/README.md), make a test call from `/` as
WRK-1001 (case LAB-1001, code 4821), then open `/review` with the reviewer
token and decide the item once the transcript webhook arrives.

## API

OpenAPI at `/docs` doubles as the tool contract. Tool endpoints return
HTTP 200 with `ok:false` + a spoken `say` sentence for business refusals;
HTTP errors are reserved for auth and malformed input. See the developer
handbook for the full endpoint table and error codes.

## Use cases

UC-01…UC-20 (wage discrepancy, missing evidence, contested deduction,
effective-dated rule change across Res. 598/2022 → Res. 340/2026, settlement
check before signing, record-vs-allegation, domestic worker routing, scope
violations, outages, opt-out). Each has a fixture in `data/workers.json` and
a test class in `tests/test_usecases.py`; the demo scripts in
`agent/test_configs/` mirror them as Agent Testing scenarios S1–S10.

## Key dates

| Date | Milestone |
|---|---|
| 23 Sep 2026 | Stage 1 canvas due (tag `stage1-2026-09-23`) |
| 30 Sep | Shortlist; build sprint starts |
| 14 Oct | Stage 2 due (tag `stage2-2026-10-14`) |
| 26–27 Oct | Demo Day |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — invariants, role ownership, the
seven steps for adding a check, and the PR checklist.

## License

[Apache License 2.0](LICENSE).
