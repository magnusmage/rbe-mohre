# D1 — No LLM anywhere in the control plane

**Status:** accepted · **Zone:** 3

The LLM lives only in the ElevenLabs Agents Platform (Zone 2). Zone 3 is
FastAPI at the edge and standard-library Python inside: it authenticates,
scopes, calculates and audits. No `anthropic`/`openai` SDKs, LangChain,
LlamaIndex or embeddings are ever imported.

**Why.** Every guarantee the product makes (Decimal amounts, effective-dated
rules, one-case scope, fail-closed) must be deterministic and testable
without a model. A model in the control plane would make guardrails
probabilistic and audits unreproducible.

**Consequence.** The agent can only speak what a tool returned; the
grounding check (`quality.py`) measures exactly that.
