# D7 — typing.Protocol adapters as the only seam to MoHRE systems

**Status:** accepted · **Zone:** 4 boundary

`ContractAdapter`, `WPSAdapter`, `CaseAdapter` are Protocols. The build uses
synthetic implementations over `data/workers.json`; a pilot swaps in
read-only REST/MCP-over-mTLS classes under `app/live/` without touching the
domain. Adapters return only the listed minimum fields (data minimisation),
and raise `DependencyDown`, which the service maps to a fail-closed refusal.

**Why.** Live integration must be an adapter change, not a rules change, and
the UC-08 test covers both paths.
