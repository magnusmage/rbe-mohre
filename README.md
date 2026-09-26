# Resolve Before It Escalates (RBE)

[![ci](https://github.com/magnusmage/rbe-mohre/actions/workflows/ci.yml/badge.svg)](https://github.com/magnusmage/rbe-mohre/actions/workflows/ci.yml)

A voice agent for MoHRE worker-rights checks. A worker calls about pay, a
deduction, payment timing or an exit settlement; the agent checks the
question against **that worker's own contract, WPS record and the rule in
force for that month**, explains the result in their language (Arabic,
English, Urdu), and prepares a complaint draft or passes the case to a
qualified specialist. It gives information, never legal advice, and never
decides anything.

> **Synthetic data only.** Every response carries `X-Data-Mode: synthetic`.
> Rule-matching logic requires qualified sign-off before any launch.

Built for the Ignyte x ElevenLabs Future of Voice AI Challenge 2026,
Track 2, Government Services / Rights Checks & Dispute Prevention.

![RBE web console: the caller screen during a live call, with verified
findings kept separate from the caller's allegation and a complaint draft
waiting for explicit confirmation](docs/images/web-console-caller.webp)

## Architecture in one paragraph

Four zones split by trust boundary. **Zone 1** (caller): a web page with the
ElevenLabs Web SDK on a short-lived signed URL. **Zone 2** (ElevenLabs
platform): Scribe v2 STT, Agents Platform + Workflows (five nodes,
per-node tool scoping), Eleven v3 TTS, Knowledge Base of public rule texts,
*configured, not coded*, from the [`agent/`](agent/) folder. **Zone 3** (this
control plane): FastAPI at the edge, standard-library Python inside: scope
enforcement, Decimal arithmetic on effective-dated rules, allegation/record
separation, tiering, specialist queue, append-only audit. **No LLM anywhere
in Zone 3.** **Zone 4**: existing MoHRE systems, reached read-only through
adapter Protocols (synthetic in the build). Every case ends at the **human
gate**: a specialist with a separate token decides, and only after the
HMAC-verified call transcript is stored.

![RBE zone architecture: the architecture of whole system, designed to
solve the problem](docs/images/rbe-arch.png)

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
│   ├── registry.py      DOMAIN node->tool map; reviewer-only actions
│   ├── quality.py       DOMAIN post-call grounding check
│   ├── store.py         DATA   sqlite3 now, Postgres later; append-only audit triggers
│   ├── adapters.py      DATA   Protocols to MoHRE systems; synthetic implementations
│   └── templates/       specialist review queue page
├── agent/               Zone 2 source of truth, ElevenLabs Agents-CLI layout
├── web/                 Zone 1 web console: React + Vite SPA (caller + specialist review)
├── data/                synthetic fixtures (one per use case) + effective-dated rules
├── tests/               28 domain tests (stdlib, no network) + api/ edge tests
├── load/                locust: tool endpoints at 2x annualised 80084 volume
├── deploy/              production deployment: nginx, systemd, deploy and smoke-test scripts
├── docs/adr/            architecture decisions D1-D10 / docs/ROADMAP.md phases
└── .github/             CI (lint, types, tests, coverage, agent-config, web build), CODEOWNERS, PR template
```

The product case (problem, evidence, what the system refuses to do) is in
[docs/product.md](docs/product.md). Diagrams (the zone map, the end-to-end call sequence and the review flow,
with the full connection table) are in [docs/architecture.md](docs/architecture.md).

Layering rule (enforced by `tests/test_layering.py`): DOMAIN and DATA import
the **standard library only**: no FastAPI, no Pydantic, no httpx, no LLM
SDKs. The whole domain suite runs in milliseconds with no network.

## Run it

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt

python -m unittest -v            # 28 tests; no network, no ElevenLabs account
make web                         # build the console once (Node 20+)
make run                         # serves the console at /, plus /health and /docs
cp .env.example .env             # tokens: python -c "import secrets;print(secrets.token_urlsafe(32))"
```

To go live end-to-end (build sprint): expose the app over HTTPS
(`cloudflared tunnel --url http://localhost:8000`), configure the ElevenLabs
agent from [`agent/`](agent/README.md), make a test call from `/` as
WRK-1001 (case LAB-1001, code 4821), then open `/review` with the reviewer
token and decide the item once the transcript webhook arrives.

## Web console

The Zone 1 web console (screenshot above) is a React + Vite SPA in
[`web/`](web/README.md), with a caller side (verify, live voice call,
findings, draft confirmation) and a specialist review side (queue,
evidence, audit trail, single signed decision). The Start Call flow is
wired to the control plane's `GET /session/signed-url` and the ElevenLabs
SDK; the browser never sees the API key (D10). The other screens run on
labelled mock data for the demo; the server-rendered `/review` page stays
the working reviewer tool.

```bash
cd web
npm ci
npm run dev                      # http://localhost:5173, proxies API to :8000
npm run build                    # type-check + build; the control plane then serves it at /
```

No configuration needed: the console talks to the same origin that serves
it, and the dev server proxies API paths to the local control plane.

## Deployment

Production deployment (nginx serving `web/dist/` and proxying the API to
uvicorn under systemd, HTTPS via Let's Encrypt) is fully described in
[`deploy/`](deploy/README.md), including a smoke-test script that verifies
a deployed instance without touching any real data.

## API

OpenAPI at `/docs` doubles as the tool contract. Tool endpoints return
HTTP 200 with `ok:false` + a spoken `say` sentence for business refusals;
HTTP errors are reserved for auth and malformed input. The connection
table in [docs/architecture.md](docs/architecture.md) lists auth and
failure behaviour per boundary; error-code handling for the agent is in
[agent/workflow.md](agent/workflow.md).

## Use cases

RBE is designed for record-specific rights checks, not generic FAQ answers.
The test suite covers UC-01 through UC-20; these representative cases show
how verified records, deterministic rules and human review work together.

### UC-01/11 — Wage discrepancy

A worker says their July salary was short. After verification, RBE checks
the worker's own contract and WPS record for that month.

- Contract wage: **AED 5,000**
- WPS payment: **AED 4,000**
- Verified shortfall: **AED 1,000**
- Outcome: explain the discrepancy and optionally prepare a complaint draft

```bash
curl -s -X POST "$HOST/tools/check_wage" \
  -H "Authorization: Bearer $AGENT_TOOL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "conv-demo-01",
    "case_ref": "LAB-1001",
    "period": "2026-07"
  }'
```

The LLM does not calculate the AED 1,000 difference: the control plane does
the arithmetic with `Decimal` and returns the verified result for the agent
to explain.

### UC-03 — Disputed deduction

The WPS record shows an **AED 700 deduction**, but the worker disputes the
reason for it. RBE verifies what the record actually shows without treating
the worker's account as false.

```text
WPS record                      Worker says
AED 700 deduction               "I dispute this deduction"
       │                                  │
       └──── verified fact     allegation ┘
                         │
                         ▼
                 Tier 2 review package
                         │
                         ▼
               Qualified specialist
```

The two claims are deliberately stored separately. The AI does not decide
which party is correct.

### UC-13 — Settlement before signing

A worker receives an exit settlement and wants to know whether the amount
matches their entitlement before signing.

```text
Contract + service dates + applicable rule
                    │
                    ▼
           Deterministic calculation
                    │
             ┌──────┴──────┐
             │             │
       Expected amount   Recorded offer
             │             │
             └──────┬──────┘
                    ▼
             Difference explained
                    │
                    ▼
          Worker makes the decision
```

RBE can explain the calculated entitlement and any difference, but it never
tells the worker to **sign** or **not sign**.

### UC-14 — Rule changes over time

RBE does not apply today's rule to an older pay period. The control plane
selects the rule that was actually in force for the month being checked.

```text
                 Payment period
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
        April 2026           June 2026
             │                   │
      Res. 598/2022        Res. 340/2026
             │                   │
             └─────────┬─────────┘
                       ▼
              Period-correct result
```

This makes rule selection deterministic and effective-dated rather than
leaving legal-rule selection to the LLM.

### UC-08 — Records system unavailable

A rights check is only useful if its evidence can be trusted. If WPS or
another authoritative dependency is unavailable, RBE refuses to manufacture
an answer.

```text
Worker asks about missing pay
             │
             ▼
       WPS record lookup
             │
          unavailable
             │
             ▼
      No guessed conclusion
             │
       ┌─────┴─────┐
       ▼           ▼
 Human transfer   Consented callback
```

The failure is audited and the worker is routed safely instead of receiving
an unsupported conclusion.

Each has a fixture in `data/workers.json` and
a test class in `tests/test_usecases.py`; the demo scripts in
`agent/test_configs/` mirror them as Agent Testing scenarios S1-S10.

## Key dates

| Date | Milestone |
|---|---|
| 23 Sep 2026 | Stage 1 canvas due (tag `stage1-2026-09-23`) |
| 30 Sep | Shortlist; build sprint starts |
| 14 Oct | Stage 2 due (tag `stage2-2026-10-14`) |
| 26-27 Oct | Demo Day |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md): invariants, role ownership, the
seven steps for adding a check, and the PR checklist.

## License

[Apache License 2.0](LICENSE).
