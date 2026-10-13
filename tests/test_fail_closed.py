"""Fail-closed and scope paths (invariants 2, 4 and 6).

Refusals must be spoken, must never carry a guessed conclusion, and must
write an audit row like any other action. Stdlib only: runs under
``python -m unittest`` with no network.
"""
import unittest
from datetime import date

from app import rules
from app import service as svc
from app.adapters import SyntheticContracts, SyntheticWPS
from app.rules import _due_date, select_timing_rule
from tests.test_usecases import RULES, WORKERS, make_store, v


def audit_results(store, conv: str) -> list[str]:
    """Results of every audit row written for one conversation, oldest first."""
    rows = store._all(
        "SELECT result FROM audit_event WHERE conversation_id=? ORDER BY id", (conv,))
    return [r["result"] for r in rows]


class ContractDown(unittest.TestCase):
    """C6 outage. Only the WPS side (C7) was covered before."""

    def test_verify_refuses_and_binds_nothing(self):
        s = make_store()
        s.contracts = SyntheticContracts(WORKERS, down=True)
        w = WORKERS["WRK-1001"]
        r = svc.verify_session(s, "cd1", "WRK-1001", w["case_ref"], w["pin"])
        self.assertFalse(r["ok"])
        self.assertEqual(r["error"], "dependency_unavailable")
        self.assertFalse(s.session("cd1")["verified"])
        self.assertIn("dependency_unavailable", audit_results(s, "cd1"))

    def test_outage_is_not_counted_as_a_failed_attempt(self):
        s = make_store()
        s.contracts = SyntheticContracts(WORKERS, down=True)
        w = WORKERS["WRK-1001"]
        for _ in range(3):
            svc.verify_session(s, "cd2", "WRK-1001", w["case_ref"], w["pin"])
        self.assertEqual(s.session("cd2")["attempts"], 0)
        self.assertFalse(s.session("cd2")["locked"])

    def test_every_check_fails_closed_after_verification(self):
        s = make_store()
        case = v(s, "cd3", "WRK-1001")
        s.contracts = SyntheticContracts(WORKERS, down=True)
        calls = {
            "check_wage": lambda: svc.check_wage(s, "cd3", case, "2026-07"),
            "check_payment_timing": lambda: svc.check_payment_timing(s, "cd3", case, "2026-07"),
            "check_settlement": lambda: svc.check_settlement(s, "cd3", case),
            "record_allegation": lambda: svc.record_allegation(
                s, "cd3", case, "2026-07", "my pay was short"),
        }
        for name, call in calls.items():
            with self.subTest(tool=name):
                r = call()
                self.assertFalse(r["ok"])
                self.assertEqual(r["error"], "dependency_unavailable")
                self.assertNotIn("findings", r)
                self.assertNotIn("AED", r["say"])
        self.assertEqual(s.allegations(case), [])           # nothing recorded on an outage
        self.assertEqual(audit_results(s, "cd3").count("dependency_unavailable"), 4)


class WpsDownEveryTool(unittest.TestCase):
    def test_all_record_checks_refuse(self):
        s = make_store()
        case = v(s, "wd1", "WRK-1001")
        s.wps = SyntheticWPS(WORKERS, down=True)
        results = {
            "check_payment_timing": svc.check_payment_timing(s, "wd1", case, "2026-07"),
            "check_settlement": svc.check_settlement(s, "wd1", case),
            "record_allegation": svc.record_allegation(s, "wd1", case, "2026-07", "short"),
        }
        for name, r in results.items():
            with self.subTest(tool=name):
                self.assertEqual(r["error"], "dependency_unavailable")
        self.assertEqual(s.allegations(case), [])


class SessionNotVerified(unittest.TestCase):
    CASE = "LAB-1001"

    def test_every_tool_refuses_before_verification(self):
        s = make_store()
        calls = {
            "check_wage": lambda: svc.check_wage(s, "nv1", self.CASE, "2026-07"),
            "check_payment_timing": lambda: svc.check_payment_timing(
                s, "nv1", self.CASE, "2026-07"),
            "check_settlement": lambda: svc.check_settlement(s, "nv1", self.CASE),
            "record_allegation": lambda: svc.record_allegation(
                s, "nv1", self.CASE, "2026-07", "short"),
            "draft_complaint": lambda: svc.draft_complaint(s, "nv1", self.CASE, "x", True),
            "send_to_review": lambda: svc.send_to_review(
                s, "nv1", self.CASE, rules.Tier.T0.value, "x"),
        }
        for name, call in calls.items():
            with self.subTest(tool=name):
                r = call()
                self.assertFalse(r["ok"])
                self.assertEqual(r["error"], "session_not_verified")
                self.assertNotIn("findings", r)
        self.assertEqual(audit_results(s, "nv1"), ["session_not_verified"] * len(calls))
        self.assertEqual(s.allegations(self.CASE), [])

    def test_failed_verification_does_not_unlock_tools(self):
        s = make_store()
        svc.verify_session(s, "nv2", "WRK-1001", self.CASE, "0000")      # wrong code
        r = svc.check_wage(s, "nv2", self.CASE, "2026-07")
        self.assertEqual(r["error"], "session_not_verified")


class ReverifyAlreadyBound(unittest.TestCase):
    def test_same_case_is_idempotent_and_audited(self):
        s = make_store()
        case = v(s, "rb1", "WRK-1001")
        w = WORKERS["WRK-1001"]
        r = svc.verify_session(s, "rb1", "WRK-1001", case, w["pin"])
        self.assertTrue(r["ok"])
        self.assertEqual(r["worker_id"], "WRK-1001")
        self.assertEqual(audit_results(s, "rb1"), ["verified", "already_bound"])

    def test_already_bound_does_not_count_a_failed_attempt(self):
        s = make_store()
        case = v(s, "rb2", "WRK-1001")
        r = svc.verify_session(s, "rb2", "WRK-1001", case, "0000")
        self.assertTrue(r["ok"])                       # bound already; no new secret is checked
        self.assertEqual(s.session("rb2")["attempts"], 0)


class InvalidPeriod(unittest.TestCase):
    BAD = ["2026-13", "2026-00", "July 2026", "26-07", "2026/07", "", "2026-7"]

    def test_period_tools_refuse_and_audit(self):
        s = make_store()
        case = v(s, "ip1", "WRK-1001")
        tools = {
            "check_wage": lambda p: svc.check_wage(s, "ip1", case, p),
            "check_payment_timing": lambda p: svc.check_payment_timing(s, "ip1", case, p),
            "record_allegation": lambda p: svc.record_allegation(s, "ip1", case, p, "short"),
        }
        n = 0
        for name, call in tools.items():
            for bad in self.BAD:
                with self.subTest(tool=name, period=bad):
                    r = call(bad)
                    n += 1
                    self.assertFalse(r["ok"])
                    self.assertEqual(r["error"], "invalid_period")
                    self.assertIn("Which month", r["say"])
        self.assertEqual(audit_results(s, "ip1").count("invalid_period"), n)
        self.assertEqual(s.allegations(case), [])      # a bad period never stores an allegation

    def test_invalid_period_is_refused_even_when_unverified(self):
        s = make_store()
        r = svc.check_wage(s, "ip2", "LAB-1001", "nonsense")
        self.assertEqual(r["error"], "invalid_period")


class RuleDates(unittest.TestCase):
    def test_no_rule_for_a_date_before_the_first_one(self):
        with self.assertRaises(LookupError) as cm:
            select_timing_rule(RULES, date(2021, 12, 31))
        self.assertEqual(str(cm.exception), "no_rule_for_date")

    def test_rule_boundaries_select_the_right_resolution(self):
        self.assertEqual(select_timing_rule(RULES, date(2026, 5, 31))["rule_id"], "WPS-598-2022")
        self.assertEqual(select_timing_rule(RULES, date(2026, 6, 1))["rule_id"], "WPS-340-2026")

    def test_december_period_is_due_in_january_of_next_year(self):
        self.assertEqual(_due_date("2026-12"), date(2027, 1, 1))
        self.assertEqual(_due_date("2026-07"), date(2026, 8, 1))


if __name__ == "__main__":
    unittest.main()
