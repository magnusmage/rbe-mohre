# app/live/ — pilot adapters (production path, empty in the build)

Live read-only adapters to MoHRE systems land here in a pilot: e.g.
`wps_rest.py` (`RestWPS`), `contracts_rest.py`, `case_submit.py` — httpx +
tenacity over mTLS, mapping upstream fields to the minimum field lists in
`app/adapters.py` and raising `DependencyDown` on transport failure.

This package is OUTSIDE the stdlib-only layer on purpose; nothing in
`app/` (domain/data) may import from it. Composition happens in `main.py`.
