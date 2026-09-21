"""Property tests (build-sprint layer). Skipped when hypothesis is absent so
the stdlib-only domain suite stays runnable with unittest alone."""
import unittest

try:
    from hypothesis import given, strategies as st
except ImportError:  # pragma: no cover
    raise unittest.SkipTest("hypothesis not installed")

from datetime import date, timedelta

from app import rules

G = {"min_service_years": 1, "days_per_year_first_5": 21, "days_per_year_after_5": 30,
     "daily_wage_divisor": 30, "cap_months_of_wage": 24}


@given(wage=st.integers(1000, 100_000), days=st.integers(0, 365 * 40))
def test_gratuity_never_exceeds_cap(wage, days):
    start = date(2000, 1, 1)
    g = rules.gratuity(wage, start, start + timedelta(days=days), G)
    assert g <= rules.money(wage) * 24
    assert g == g.quantize(rules.CENT)


@given(tiers=st.lists(st.sampled_from(list(rules.Tier)), min_size=1, max_size=6))
def test_tier_floor_is_max(tiers):
    final = max(tiers, key=lambda t: rules.TIER_ORDER[t])
    assert all(rules.TIER_ORDER[final] >= rules.TIER_ORDER[t] for t in tiers)
