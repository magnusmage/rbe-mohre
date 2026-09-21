# D2 — No embeddings or RAG server-side

**Status:** accepted · **Zone:** 3

Knowledge-base retrieval runs inside the ElevenLabs platform, over public
rule texts only, with citations. Zone 3 holds rule **parameters**
(`data/rules.json`), not rule prose, and selects them by date, not by
similarity.

**Why.** Retrieval similarity is not a legal-applicability test. The rule
that applied to a pay period is a date-range lookup, and must be exactly
reproducible from the audit log months later.
