# Agent Workflow: five fixed nodes

Per-node tool scoping is the platform-side twin of `app/registry.py: NODE_TOOLS`.
A unit test (`PlatformContract`) fails if the tool set drifts; if you add a tool,
change this file, the registry and `tools.json` in the same pull request.

| Node | Says or does | Tools | Exits |
|---|---|---|---|
| 1 Disclosure | AI assistant, recorded, information not legal advice, staff decide | none | -> 2 |
| 2 Verify | Collects worker ID, case ref, one-time code; reads back | `verify_session` | ok -> 3; failed -> retry once; locked -> end |
| 3 Wage / WPS | Pay amount, deductions, payment timing | `check_wage`, `check_payment_timing`, `record_allegation` | clear -> end or 5; discrepancy, ambiguous, out of scope -> 5 |
| 4 Entitlement | Settlement and gratuity before signing | `check_settlement` | -> 5 or end |
| 5 Evidence / case | Draft for confirmation; send to review | `record_allegation`, `draft_complaint`, `send_to_review` | end |
| Global | "human", "stop", consent withdrawn; "should I sign?" gets facts only | `transfer_to_human` | transfer, or callback only with consent |

Every node also has `transfer_to_human` except node 1 (no tools at all).

## Edges on error codes

| error | Edge |
|---|---|
| `session_not_verified` | back to node 2 |
| `verification_failed` | node 2, one retry |
| `verification_locked` | closing message, end |
| `already_verified` | explain second case needs a new call |
| `case_scope_violation` | speak refusal; stay on current case |
| `invalid_period` | ask which month |
| `dependency_unavailable` | no conclusion; transfer or consented callback |
| `not_confirmed` | ask the worker to confirm first |
| `callback_without_consent` | ask consent or transfer live |
| `invalid_tier` | transfer to a human |
