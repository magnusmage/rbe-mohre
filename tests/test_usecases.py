"""One test class per use case, plus platform-contract checks.

Run with ``python -m unittest -v`` (no network, no ElevenLabs account) or
``make test``. Every test guards a branch of the flows in agent/workflow.md;
do not remove a test that guards an invariant.
"""
import json
import time
import unittest
from pathlib import Path

from app import quality, rules, service as svc
from app.adapters import SyntheticWPS
from app.normalise import normalise_ref
from app.signature import BadSignature, sign, verify
from app.store import Store

ROOT = Path(__file__).resolve().parent.parent
WORKERS = {w["worker_id"]: w for w in json.loads((ROOT / "data/workers.json").read_text())}
RULES = json.loads((ROOT / "data/rules.json").read_text())


def make_store() -> Store:
    return Store(":memory:", workers=WORKERS, rules=RULES)


def v(store: Store, conv: str, worker_id: str) -> str:
    """Verify a session for a fixture worker; returns the bound case_ref."""
    w = WORKERS[worker_id]
    r = svc.verify_session(store, conv, worker_id, w["case_ref"], w["pin"])
    assert r["ok"], r
    return w["case_ref"]


# ------------------------------------------------------------------ wage

class UC01_11_WageDiscrepancy(unittest.TestCase):
    def test_discrepancy_amount_and_say(self):
        s = make_store()
        case = v(s, "c01", "WRK-1001")
        r = svc.check_wage(s, "c01", case, "2026-07")
        self.assertEqual(r["status"], "discrepancy")
        self.assertEqual(r["findings"][0]["amount"], "1000.00")
        self.assertTrue(r["findings"][0]["verified"])
        self.assertIn("AED 1000.00", r["say"])
        self.assertFalse(r["binding_decision"])

    def test_confirmed_draft_and_review(self):
        s = make_store()
        case = v(s, "c11", "WRK-1001")
        svc.check_wage(s, "c11", case, "2026-07")
        self.assertEqual(
            svc.draft_complaint(s, "c11", case, "short pay", False)["error"],
            "not_confirmed")
        d = svc.draft_complaint(s, "c11", case, "short pay July", True)
        self.assertTrue(d["ok"])
        self.assertFalse(d["filed"])                       # never filed in the build
        r = svc.send_to_review(s, "c11", case, rules.Tier.T0.value, "wage shortfall")
        self.assertTrue(r["ok"])
        self.assertTrue(r["review_ref"].startswith("RV-"))


class UC02_MissingEvidence(unittest.TestCase):
    def test_no_wps_line_never_guesses(self):
        s = make_store()
        case = v(s, "c02", "WRK-1001")
        r = svc.check_wage(s, "c02", case, "2026-06")
        self.assertEqual(r["status"], "needs_evidence")
        self.assertEqual(r["tier"], rules.Tier.T1.value)
        self.assertIn("won't guess", r["say"])


class UC03_ContestedDeduction(unittest.TestCase):
    def test_deduction_is_fact_reason_is_not(self):
        s = make_store()
        case = v(s, "c03", "WRK-1002")
        r = svc.check_wage(s, "c03", case, "2026-07")
        self.assertEqual(r["status"], "discrepancy")
        self.assertEqual(r["tier"], rules.Tier.T1.value)
        self.assertIn("deduction of AED 700.00", r["findings"][0]["detail"])
        # sprint-fix guard: a deduction in July never taints a clean June
        r6 = svc.check_wage(s, "c03", case, "2026-06")
        self.assertEqual(r6["status"], "clear")
        self.assertEqual(r6["tier"], rules.Tier.T0.value)

    def test_allegation_recorded_separately(self):
        s = make_store()
        case = v(s, "c03b", "WRK-1002")
        r = svc.record_allegation(s, "c03b", case, "2026-07",
                                  "The damage was not my fault")
        self.assertEqual(r["tier"], rules.Tier.T2.value)
        codes = {f["code"]: f["verified"] for f in r["findings"]}
        self.assertTrue(codes["RECORD"])
        self.assertFalse(codes["ALLEGATION"])
        self.assertNotIn("wrong", r["say"].lower())
        self.assertEqual(len(s.allegations(case)), 1)


class UC04_ClearEntitlement(unittest.TestCase):
    def test_offer_covers_gratuity(self):
        s = make_store()
        case = v(s, "c04", "WRK-1010")
        r = svc.check_settlement(s, "c04", case)
        self.assertEqual(r["status"], "clear")
        self.assertIn("decision to sign is yours", r["say"])


class UC05_AmbiguousRule(unittest.TestCase):
    def test_transition_month_escalates(self):
        s = make_store()
        case = v(s, "c05", "WRK-1004")
        r = svc.check_payment_timing(s, "c05", case, "2026-05")
        self.assertEqual(r["status"], "ambiguous")
        self.assertEqual(r["tier"], rules.Tier.T2.value)
        self.assertEqual(r["findings"], [])                 # no guessed conclusion


class UC06_OutOfScope(unittest.TestCase):
    def test_difc_routed_not_calculated(self):
        s = make_store()
        case = v(s, "c06", "WRK-1008")
        r = svc.check_wage(s, "c06", case, "2026-07")
        self.assertEqual(r["status"], "out_of_scope")
        self.assertEqual(r["tier"], rules.Tier.T1.value)
        self.assertNotIn("AED", r["say"])


class UC07_CrossWorker(unittest.TestCase):
    def test_other_case_refused_and_audited(self):
        s = make_store()
        v(s, "c07", "WRK-1001")
        r = svc.check_wage(s, "c07", "LAB-1002", "2026-07")
        self.assertEqual(r["error"], "case_scope_violation")
        audited = [a for a in s.audit_for("LAB-1002")
                   if a["result"] == "case_scope_violation"]
        self.assertEqual(len(audited), 1)


class UC08_DependencyDown(unittest.TestCase):
    def test_fail_closed_no_conclusion(self):
        s = make_store()
        case = v(s, "c08", "WRK-1001")
        s.wps = SyntheticWPS(WORKERS, down=True)            # C7 outage
        r = svc.check_wage(s, "c08", case, "2026-07")
        self.assertEqual(r["error"], "dependency_unavailable")
        self.assertIn("won't give an answer I can't check", r["say"])


class UC09_LanguageInvariance(unittest.TestCase):
    def test_arabic_and_urdu_digits_normalise(self):
        self.assertEqual(normalise_ref("wrk ١٠٠١"), "WRK-1001")   # Arabic-Indic
        self.assertEqual(normalise_ref("lab۱۰۰۱"), "LAB-1001")    # Eastern / Urdu
        self.assertEqual(normalise_ref("٤٨٢١"), "4821")
        s = make_store()
        r = svc.verify_session(s, "c09", "wrk ١٠٠١", "lab-1001", "٤٨٢١")
        self.assertTrue(r["ok"])


class UC10_OptOut(unittest.TestCase):
    def test_transfer_and_callback_consent(self):
        s = make_store()
        r = svc.transfer_to_human(s, "c10", "caller said human")
        self.assertEqual(r["mode"], "transfer")
        r = svc.transfer_to_human(s, "c10", "wants callback", callback=True, consent=False)
        self.assertEqual(r["error"], "callback_without_consent")
        r = svc.transfer_to_human(s, "c10", "wants callback", callback=True, consent=True)
        self.assertEqual(r["mode"], "callback")


class UC12_ConsentBoundToCase(unittest.TestCase):
    def test_second_case_needs_new_call(self):
        s = make_store()
        v(s, "c12", "WRK-1001")
        w2 = WORKERS["WRK-1002"]
        r = svc.verify_session(s, "c12", "WRK-1002", w2["case_ref"], w2["pin"])
        self.assertEqual(r["error"], "already_verified")


# ----------------------------------------------------------- entitlement

class UC13_SettlementBeforeSigning(unittest.TestCase):
    def test_shortfall_information_not_advice(self):
        s = make_store()
        case = v(s, "c13", "WRK-1003")
        r = svc.check_settlement(s, "c13", case)
        self.assertEqual(r["status"], "discrepancy")
        self.assertEqual(r["findings"][0]["amount"], "9272.60")
        self.assertIn("AED 17272.60", r["findings"][0]["detail"])
        self.assertIn("information, not advice", r["say"])
        for banned in ("you should sign", "don't sign", "do not sign"):
            self.assertNotIn(banned, r["say"].lower())


class UC14_EffectiveDatedRule(unittest.TestCase):
    def test_rule_selected_by_pay_period(self):
        s = make_store()
        case = v(s, "c14", "WRK-1004")
        april = svc.check_payment_timing(s, "c14", case, "2026-04")
        self.assertEqual(april["status"], "clear")
        self.assertIn("598 of 2022", april["say"])
        june = svc.check_payment_timing(s, "c14", case, "2026-06")
        self.assertEqual(june["status"], "discrepancy")
        self.assertEqual(june["findings"][0]["rule_id"], "WPS-340-2026")
        self.assertIn("9 day(s)", june["findings"][0]["detail"])


class UC15_RecordVsAllegation(unittest.TestCase):
    def test_never_contradicts_the_worker(self):
        s = make_store()
        case = v(s, "c15", "WRK-1005")
        r = svc.record_allegation(s, "c15", case, "2026-07",
                                  "My bank card is kept by the supervisor; "
                                  "I got AED 1,200 in cash")
        self.assertEqual(r["tier"], rules.Tier.T2.value)
        self.assertEqual({f["code"] for f in r["findings"]}, {"RECORD", "ALLEGATION"})
        self.assertIn("recorded both, separately", r["say"])


class UC16_EstablishmentVsIndividual(unittest.TestCase):
    def test_compliance_does_not_settle_individual(self):
        s = make_store()
        case = v(s, "c16", "WRK-1006")
        r = svc.check_wage(s, "c16", case, "2026-07")
        self.assertEqual(r["findings"][0]["amount"], "2600.00")
        self.assertIn("91% paid on time", r["say"])
        self.assertIn("owed to you individually", r["say"])


class UC17_DomesticWorker(unittest.TestCase):
    def test_separate_regime_routed(self):
        s = make_store()
        case = v(s, "c17", "WRK-1007")
        r = svc.check_wage(s, "c17", case, "2026-07")
        self.assertEqual(r["status"], "out_of_scope")
        self.assertEqual(r["tier"], rules.Tier.T2.value)
        self.assertIn("Federal Law 9 of 2022", r["say"])
        self.assertNotIn("AED", r["say"])                   # no private-sector number


class UC18_WpsExemptCourtClaim(unittest.TestCase):
    def test_court_period_not_rechecked(self):
        s = make_store()
        case = v(s, "c18", "WRK-1009")
        r = svc.check_wage(s, "c18", case, "2026-04")
        self.assertEqual(r["status"], "out_of_scope")
        self.assertIn("before the court", r["say"])


# -------------------------------------------------------------- guardrails

class VerificationLock(unittest.TestCase):
    def test_two_failures_lock_the_call(self):
        s = make_store()
        r1 = svc.verify_session(s, "cvl", "WRK-1001", "LAB-1001", "0000")
        self.assertEqual(r1["error"], "verification_failed")
        r2 = svc.verify_session(s, "cvl", "WRK-1001", "LAB-1001", "9999")
        self.assertEqual(r2["error"], "verification_locked")
        r3 = svc.verify_session(s, "cvl", "WRK-1001", "LAB-1001", "4821")  # correct, too late
        self.assertEqual(r3["error"], "verification_locked")


class TierFloor(unittest.TestCase):
    def test_tier_never_lowered(self):
        s = make_store()
        case = v(s, "ctf", "WRK-1002")
        svc.record_allegation(s, "ctf", case, "2026-07", "not my fault")   # tier 2 seen
        r = svc.send_to_review(s, "ctf", case, rules.Tier.T0.value, "requesting tier 0")
        self.assertEqual(r["tier"], rules.Tier.T2.value)                   # invariant 5
        self.assertEqual(
            svc.send_to_review(s, "ctf", case, "tier_9_nope", "x")["error"],
            "invalid_tier")


class DecisionLock(unittest.TestCase):
    def test_transcript_unlocks_and_decides_once(self):
        s = make_store()
        case = v(s, "cdl", "WRK-1001")
        svc.check_wage(s, "cdl", case, "2026-07")
        rv = svc.send_to_review(s, "cdl", case, rules.Tier.T0.value, "wage")["review_ref"]
        self.assertEqual(svc.decide(s, rv, "open_complaint", "sp-1")["error"],
                         "transcript_pending")
        s.save_transcript("cdl", {"data": {"conversation_id": "cdl"}})
        self.assertEqual(svc.decide(s, rv, "not_a_decision", "sp-1")["error"],
                         "invalid_decision")
        self.assertTrue(svc.decide(s, rv, "open_complaint", "sp-1")["ok"])
        self.assertEqual(svc.decide(s, rv, "refer", "sp-2")["error"], "already_decided")
        self.assertEqual(svc.decide(s, "RV-none", "refer", "sp-2")["error"], "not_found")


class AuditAppendOnly(unittest.TestCase):
    def test_triggers_block_update_and_delete(self):
        import sqlite3
        s = make_store()
        s.audit("agent", "check_wage", "clear", "ca", "LAB-1001")
        with self.assertRaises(sqlite3.IntegrityError):
            s.db.execute("UPDATE audit_event SET result='edited'")
        with self.assertRaises(sqlite3.IntegrityError):
            s.db.execute("DELETE FROM audit_event")


class WebhookSignature(unittest.TestCase):
    def test_verify_roundtrip_mismatch_and_stale(self):
        body, secret = b'{"data":{"conversation_id":"c1"}}', "whsec"
        verify(sign(body, secret), body, secret)            # good header passes
        with self.assertRaises(BadSignature):
            verify(sign(body, "other"), body, secret)       # mismatch
        with self.assertRaises(BadSignature):
            verify(sign(body, secret, now=time.time() - 3600), body, secret)  # stale
        with self.assertRaises(BadSignature):
            verify("garbage", body, secret)                 # malformed


class PlatformContract(unittest.TestCase):
    def test_agent_configs_match_registry(self):
        """agent/ (Zone 2 source of truth) and registry.py must agree.
        If you add a tool, change both in the same pull request."""
        from app import registry
        agent_dir = ROOT / "agent"
        tools_index = json.loads((agent_dir / "tools.json").read_text())
        names = set()
        for entry in tools_index["tools"]:
            cfg = json.loads((agent_dir / entry["config"]).read_text())
            names.add(cfg["name"])
        self.assertEqual(names, registry.AGENT_TOOLS)
        node_union = set().union(*registry.NODE_TOOLS.values())
        self.assertEqual(node_union, registry.AGENT_TOOLS)
        self.assertFalse(registry.REVIEWER_ONLY & registry.AGENT_TOOLS)


class MoneyAndGratuity(unittest.TestCase):
    def test_decimal_rounding_and_cap(self):
        from datetime import date
        self.assertEqual(str(rules.money(0.1 + 0.2)), "0.30")     # never float maths
        self.assertEqual(str(rules.money("1000")), "1000.00")
        g = RULES["gratuity"]
        capped = rules.gratuity(3000, date(1990, 1, 1), date(2026, 1, 1), g)
        self.assertLessEqual(capped, rules.money(3000) * g["cap_months_of_wage"])
        self.assertEqual(rules.gratuity(3000, date(2026, 1, 1), date(2026, 6, 1), g),
                         rules.money(0))                          # under one year


class GroundingCheck(unittest.TestCase):
    def test_ungrounded_amount_and_rule_detected(self):
        tool_results = [{"say": "difference AED 1000.00", "rule_id": "CONTRACT-VS-WPS"}]
        ok = quality.ungrounded("The difference is AED 1000.00 (CONTRACT-VS-WPS).",
                                tool_results)
        self.assertEqual(ok, {"rule_ids": set(), "amounts": set()})
        bad = quality.ungrounded("You are owed AED 9999.00 under WPS-340-2026.",
                                 tool_results)
        self.assertEqual(bad["amounts"], {"9999.00"})
        self.assertEqual(bad["rule_ids"], {"WPS-340-2026"})


if __name__ == "__main__":
    unittest.main()
