# D3: Three layers; domain and data import stdlib only

**Status:** accepted / **Zone:** 3

EDGE (`main`, `settings`, `signature`, `normalise` allowed to see FastAPI /
Pydantic / httpx) -> DOMAIN (`service`, `rules`, `registry`, `quality`) ->
DATA (`store`, `adapters`). Dependencies point down only. Domain and data
import nothing outside the standard library, enforced by
`tests/test_layering.py`, not by convention.

**Why.** Every guardrail is testable with no web server, network or voice
platform: the whole domain suite runs in tens of milliseconds.
