# D10: Zone 1 web console as a separate SPA in web/

**Status:** accepted / **Zone:** 1

The caller and specialist screens ship as a React + Vite SPA in `web/`,
built to static files and served next to the API on one origin. The only
control-plane call wired in the build is `GET /session/signed-url`; the
voice session runs over the ElevenLabs SDK with that short-lived URL, so
the API key never reaches the browser. Screens beyond the call flow render
labelled mock data; the server-rendered `/review` page remains the working
reviewer tool until the console is wired to the reviewer endpoints. The
console reads exactly one build-time setting, `VITE_API_BASE_URL`, and
fails fast when it is missing.

**Why.** The demo needs a credible caller and reviewer experience that the
minimal templates cannot carry, without weakening any Zone 3 guarantee.
Serving the SPA and the API from one origin keeps the no-CORS posture: the
control plane never grows cross-origin headers, and every browser call
stays subject to the same token rules as before.

**Consequence.** `web/` owns its own toolchain (Node 20, npm, strict
TypeScript) and CI builds it on every PR. Wiring a mock screen to a real
endpoint means replacing imports from `src/data/mock.ts` with typed fetch
hooks, and each such change goes through the same PR review as a tool
change. Deployment serves `web/dist/` as static files and proxies API
paths to uvicorn (see `deploy/`).
