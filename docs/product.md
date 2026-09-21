# Product overview

## The problem

A worker in the UAE notices missing pay, an unexplained deduction, or an
unclear end-of-service entitlement. The channels to ask are mature: MoHRE's
80084 centre handled [3.4 million calls in the first half of 2026](https://www.khaleejtimes.com/uae/uae-mohre-labour-claims-advisory-centre-34-million-calls-first-half-2026)
with AI-supported routing in over 22 languages, and
[98.6% of labour disputes settle amicably](https://gulfnews.com/uae/how-99-of-uae-labour-disputes-settled-without-court-1.500631337).
But three gaps remain on the worker's side of the call:

1. **Answers are generic, not record-specific.** FAQ answers and awareness
   guides exist; an answer checked against *this worker's own contract and
   WPS record* is not published anywhere. Clear questions still turn into
   follow-ups and complaints: 80084 made 2.3M outbound calls against
   1.12M inbound in H1 2026.
2. **Rules change under people's feet.**
   [Resolution 340 of 2026](https://www.ey.com/en_gl/technical/tax-alerts/uae-introduces-enhanced-wage-protection-system-effective-1-june-2026)
   moved the wage due date from June 2026, replacing Resolution 598/2022.
   Which rule applied to a given month's pay is a dated question most
   callers cannot answer alone.
3. **The costliest moment is signing.** At exit, workers may sign that all
   dues were received without knowing what is owed
   ([documented cases](https://www.business-humanrights.org/en/latest-news/uae-legal-opinion-highlights-barriers-to-access-justice-for-migrant-workers-facing-employers-malicious-absconding-claims/)).
   A number computed *before* the signature prevents the dispute instead of
   litigating it.

The UAE hosts roughly 8.7 million migrant workers; the largest groups are
South Asian, and voice in their own language (no forms, no reading) is
the most accessible channel they have.

## What RBE does

One inbound voice call, in Arabic, English or Urdu:

1. The agent discloses it is an AI, that the call is recorded, and that it
   gives information, never legal advice.
2. It verifies the caller and binds the call to one worker and one case.
3. It answers the question from the caller's **own records**: contract
   wage vs the WPS line for that month, payment timing under the rule in
   force *for that month*, or the end-of-service settlement computed from
   the contract before anything is signed.
4. Clear cases end there, in minutes. Anything disputed, ambiguous or out
   of scope goes to a human specialist with a ready-made package: verified
   facts, the caller's own account (kept separate), and the transcript.

The one-line difference from what exists today: **MoHRE has automated the
transactions and the FAQs; RBE automates the record-specific conversation.**

## What RBE deliberately does not do

These boundaries are enforced in code, not just promised
(see [architecture](architecture.md) and the test suite):

- The AI never calculates and never decides. Every figure comes from a
  deterministic rules engine; every decision belongs to a credentialed
  human, unlocked only after the verified call transcript is stored.
- It never tells a worker to sign, resign, or sue: numbers and the rule,
  cited; the choice is the worker's.
- It never contradicts the worker. The record and the worker's account are
  both kept, separately: WPS can show "paid" while cash was withheld, and
  the system is built to respect that.
- It never touches another worker's data: one call, one worker, one case,
  re-checked on every tool call server-side.
- Out-of-scope callers (domestic workers under Federal Law 9/2022,
  DIFC/ADGM employees, matters already in court) are routed, never given a
  private-sector calculation.
- It fails closed: if a record system is down or a rule is ambiguous, it
  says so and hands over to a person, rather than guessing.

## Success measures

| Measure | Baseline today | Target |
|---|---|---|
| Clear rights-check turnaround | ~3 days average resolution | Same call, <= 15 minutes |
| Follow-up calls for eligible clear cases | 2.3M outbound vs 1.12M inbound (H1 2026) | Zero outbound needed for cases resolvable from records |
| Capacity headroom | 3.4M calls / half-year | >= 2x annualised volume in load tests |

## Scope and status

The build runs entirely on **synthetic data** behind the same interfaces a
real integration would use; every response is stamped
`X-Data-Mode: synthetic`. Rule parameters are effective-dated and flagged
for qualified sign-off before any launch. The path from this build to a
pilot (live read-only record access, national identity verification, the
80084 phone channel) is laid out in the [roadmap](ROADMAP.md), and the
twenty use cases the system is tested against are in the
[test suite](../tests/test_usecases.py).
