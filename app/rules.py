"""Deterministic checks: wage, payment timing, settlement, scope, allegation.

DOMAIN layer. Standard library only (enforced by tests/test_layering.py).
Every amount is Decimal; every check returns a CheckResult with a reviewed
``say`` sentence. Nothing in this module decides anything
(``binding_decision`` is always False); invariant 1.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum

CENT = Decimal("0.01")


class Tier(str, Enum):
    T0 = "tier_0_standard_review"
    T1 = "tier_1_priority_review"
    T2 = "tier_2_mandatory_human"


TIER_ORDER = {Tier.T0: 0, Tier.T1: 1, Tier.T2: 2}

# Pay periods whose due date sits on the 598/2022 -> 340/2026 rule change:
# never answered by the machine, always a qualified reading (UC-05, UC-14).
TRANSITION_PERIODS = {"2026-05"}


@dataclass
class Finding:
    code: str          # WAGE_SHORTFALL | PAID_LATE | SETTLEMENT_SHORTFALL | RECORD | ALLEGATION
    detail: str
    rule_id: str
    source: str
    verified: bool     # True = from records; False = caller allegation (invariant 3)
    amount: str | None = None


@dataclass
class CheckResult:
    check: str
    status: str        # clear | discrepancy | needs_evidence | ambiguous | out_of_scope
    findings: list[Finding] = field(default_factory=list)
    tier: Tier = Tier.T0
    say: str = ""
    binding_decision: bool = False   # constant: nothing here is a ruling

    def to_dict(self) -> dict:
        d = asdict(self)
        d["tier"] = self.tier.value
        return d


def money(x) -> Decimal:
    """Decimal(str(x)) first, never Decimal(float)."""
    return Decimal(str(x)).quantize(CENT, ROUND_HALF_UP)


# ---------------------------------------------------------------- scope gate

def scope_check(worker: dict, rules: dict, period: str | None = None) -> CheckResult | None:
    """Checked before any calculation, so an out-of-scope caller never
    receives a private-sector number (UC-06, UC-17, UC-18)."""
    sc = rules["scope"]
    if worker["zone"] in sc["free_zones_outside_mohre"]:
        return CheckResult(
            "scope", "out_of_scope", tier=Tier.T1,
            say=(f"Employment in {worker['zone']} is outside MoHRE's jurisdiction; it has its own "
                 f"employment law and courts. I'll point you to the right channel."))
    if worker["category"] in sc["separate_regimes"]:
        regime = sc["separate_regimes"][worker["category"]]
        return CheckResult(
            "scope", "out_of_scope", tier=Tier.T2,
            say=(f"Domestic workers are covered by {regime}. I won't apply private-sector rules; "
                 f"I'll connect you to the team that handles domestic-worker cases."))
    if period and period in (worker.get("wage_claim_in_court_periods") or []):
        return CheckResult(
            "scope", "out_of_scope", tier=Tier.T1,
            say=(f"A wage claim for {period} is already before the court, so I can't re-check it here. "
                 f"A specialist can explain the court process."))
    return None


# ---------------------------------------------------------------- wage check

def wage_check(worker: dict, period: str, rules: dict) -> CheckResult:
    """UC-01/02/03/11/16. Contract total wage vs the WPS line for one month."""
    out = scope_check(worker, rules, period)
    if out:
        return out
    line = next((w for w in worker["wps"] if w["period"] == period), None)
    if line is None:  # UC-02: never guess
        return CheckResult(
            "wage", "needs_evidence", tier=Tier.T1,
            say=(f"I can't see a WPS record for {period}, so I can't confirm what was paid. "
                 f"I won't guess; a specialist can request it."))
    due, paid = money(worker["total_wage"]), money(line["paid"])
    if paid >= due:
        return CheckResult(
            "wage", "clear", tier=Tier.T0,
            say=f"For {period}, WPS shows AED {paid}, which matches your contract wage of AED {due}.")
    gap = due - paid
    detail = f"Contract total wage AED {due}; WPS shows AED {paid} for {period}; difference AED {gap}"
    tier = Tier.T0
    say = detail + "."
    # UC-03: deduction on the CHECKED month only (the amount is fact, the reason is not)
    if line.get("deduction"):
        detail += (f"; employer recorded a deduction of AED {money(line['deduction'])} "
                   f"({line.get('deduction_reason_recorded')})")
        tier = Tier.T1
        say = detail + "."
    f = Finding("WAGE_SHORTFALL", detail, "CONTRACT-VS-WPS",
                "Employment contract; WPS record", True, str(gap))
    # UC-16: establishment compliance never settles an individual entitlement
    if worker.get("establishment_compliance_pct") is not None:
        say += (f" Your employer may meet the overall WPS threshold "
                f"({worker['establishment_compliance_pct']}% paid on time), "
                f"but that does not settle what is owed to you individually.")
    return CheckResult("wage", "discrepancy", [f], tier, say=say)


# ------------------------------------------------------------ payment timing

def select_timing_rule(rules: dict, due_date: date) -> dict:
    """Effective-dated rule selection by DUE DATE, never by 'today' (UC-14)."""
    for r in rules["payment_timing"]:
        start = date.fromisoformat(r["effective_from"])
        end = date.fromisoformat(r["effective_to"]) if r["effective_to"] else date.max
        if start <= due_date <= end:
            return r
    raise LookupError("no_rule_for_date")


def _due_date(period: str) -> date:
    y, m = int(period[:4]), int(period[5:7])
    m += 1
    if m == 13:
        y, m = y + 1, 1
    return date(y, m, 1)


def timing_check(worker: dict, period: str, rules: dict) -> CheckResult:
    """UC-05/14. Which WPS resolution governed this month's pay, and was it late."""
    out = scope_check(worker, rules, period)
    if out:
        return out
    if period in TRANSITION_PERIODS:  # UC-05: the machine does not interpret transitions
        return CheckResult(
            "timing", "ambiguous", tier=Tier.T2,
            say=(f"The pay for {period} falls on the change between two wage-payment resolutions, "
                 f"so which rule applies needs a qualified reading. I'm passing this to a specialist "
                 f"rather than guessing."))
    line = next((w for w in worker["wps"] if w["period"] == period), None)
    if line is None or not line.get("paid_on"):
        return CheckResult(
            "timing", "needs_evidence", tier=Tier.T1,
            say=(f"I can't see a payment date for {period}, so I can't check the timing. "
                 f"I won't guess; a specialist can request the record."))
    due = _due_date(period)
    rule = select_timing_rule(rules, due)
    deadline = date(due.year, due.month, rule["late_after_day"])
    paid_on = date.fromisoformat(line["paid_on"])
    if paid_on <= deadline:
        return CheckResult(
            "timing", "clear", tier=Tier.T0,
            say=(f"Wages for {period} were paid on {paid_on.isoformat()}, on time under "
                 f"{rule['source']}."))
    days = (paid_on - deadline).days
    f = Finding("PAID_LATE",
                f"Paid {paid_on.isoformat()}, {days} day(s) after {deadline.isoformat()}",
                rule["rule_id"], rule["source"], True)
    return CheckResult(
        "timing", "discrepancy", [f], Tier.T0,
        say=(f"Wages for {period} were paid on {paid_on.isoformat()}, {days} day(s) after the date "
             f"set by {rule['source']}."))


# ------------------------------------------------------- end-of-service maths

def gratuity(basic_wage, start: date, end: date, g: dict) -> Decimal:
    """Federal Decree-Law 33/2021 gratuity. Divisor and pro-rata need sign-off."""
    years = Decimal((end - start).days + 1) / Decimal(365)
    if years < g["min_service_years"]:
        return money(0)
    daily = money(basic_wage) / Decimal(g["daily_wage_divisor"])
    first = min(years, Decimal(5)) * g["days_per_year_first_5"]
    rest = max(years - 5, Decimal(0)) * g["days_per_year_after_5"]
    amount = (first + rest) * daily
    cap = money(basic_wage) * g["cap_months_of_wage"]
    return money(min(amount, cap))


def settlement_check(worker: dict, rules: dict) -> CheckResult:
    """UC-13/19. Calculated gratuity vs the offer, before the worker signs.
    Information, never advice; the say sentence carries that boundary."""
    out = scope_check(worker, rules)
    if out:
        return out
    offer = worker.get("settlement_offer")
    if not worker.get("end_date") or offer is None:
        return CheckResult(
            "settlement", "needs_evidence", tier=Tier.T1,
            say=("I need your contract end date and the settlement you've been offered "
                 "to check this. I won't guess."))
    g = rules["gratuity"]
    calc = gratuity(worker["basic_wage"], date.fromisoformat(worker["start_date"]),
                    date.fromisoformat(worker["end_date"]), g)
    offered = money(offer)
    if offered >= calc:
        return CheckResult(
            "settlement", "clear", tier=Tier.T0,
            say=(f"From your contract, the gratuity comes to about AED {calc}; "
                 f"the offer of AED {offered} covers it. The decision to sign is yours."))
    gap = calc - offered
    f = Finding("SETTLEMENT_SHORTFALL",
                f"Calculated gratuity AED {calc} from basic wage AED {money(worker['basic_wage'])}; "
                f"offered AED {offered}",
                g["rule_id"], "Federal Decree-Law 33 of 2021, end-of-service gratuity (basic wage)",
                True, str(gap))
    return CheckResult(
        "settlement", "discrepancy", [f], Tier.T1,
        say=(f"From your contract, the gratuity comes to about AED {calc}; the offer is "
             f"AED {offered}, AED {gap} less. This is information, not advice: whether to sign "
             f"is your decision, and I can connect you to a specialist first."))


# ------------------------------------------------------ record vs allegation

def allegation_result(worker: dict, period: str, statement: str, rules: dict) -> CheckResult:
    """UC-03/15. The WPS record is a verified fact; the caller's account is an
    allegation. Both are kept, separately, and the agent never contradicts the
    worker (invariant 3). Always tier 2."""
    out = scope_check(worker, rules, period)
    if out:
        return out
    line = next((w for w in worker["wps"] if w["period"] == period), None)
    findings = []
    if line is not None:
        findings.append(Finding(
            "RECORD", f"WPS shows AED {money(line['paid'])} paid on {line.get('paid_on')}",
            "WPS-RECORD", "WPS record", True))
    findings.append(Finding(
        "ALLEGATION", statement, "CALLER-STATEMENT", "Caller, unverified", False))
    record_part = (f"WPS shows AED {money(line['paid'])} paid on {line.get('paid_on')}. "
                   if line is not None else "")
    return CheckResult(
        "allegation", "discrepancy", findings, Tier.T2,
        say=(f"{record_part}You've told me you did not receive it. I've recorded both, "
             f"separately, and I'm sending this to a specialist to look into."))
