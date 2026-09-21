"""The seam to MoHRE systems (Zone 4, connections C6/C7/C8).

DATA layer, standard library only. The domain depends on a Protocol, not a
system: swapping synthetic data for a live read-only API is a new class in
``app/live/`` (pilot), not a change to the rules. Adapters return only the
fields the rules need; that is the data-minimisation guarantee in code.
"""
from __future__ import annotations

from typing import Protocol


class DependencyDown(Exception):
    """A record system did not answer in time. The service fails closed on this
    (invariant 4)."""

    def __init__(self, system: str):
        self.system = system
        super().__init__(system)


class ContractAdapter(Protocol):
    def contract(self, worker_id: str) -> dict: ...


class WPSAdapter(Protocol):
    def lines(self, worker_id: str) -> list[dict]: ...


class CaseAdapter(Protocol):
    def submit_draft(self, case_ref: str, body: dict) -> str: ...


# Minimum fields each adapter may return. Anything else is stripped.
CONTRACT_FIELDS = ("worker_id", "case_ref", "pin", "category", "zone",
                   "basic_wage", "total_wage", "start_date", "end_date",
                   "settlement_offer", "establishment_compliance_pct",
                   "wage_claim_in_court_periods")
WPS_FIELDS = ("period", "paid", "paid_on", "deduction", "deduction_reason_recorded")


class SyntheticContracts:
    def __init__(self, workers: dict[str, dict], down: bool = False):
        self._w, self.down = workers, down

    def contract(self, worker_id: str) -> dict:
        if self.down:
            raise DependencyDown("contract")
        w = self._w[worker_id]
        return {k: w.get(k) for k in CONTRACT_FIELDS}


class SyntheticWPS:
    def __init__(self, workers: dict[str, dict], down: bool = False):
        self._w, self.down = workers, down

    def lines(self, worker_id: str) -> list[dict]:
        if self.down:
            raise DependencyDown("wps")
        return [{k: line.get(k) for k in WPS_FIELDS}
                for line in self._w[worker_id].get("wps", [])]


class SyntheticCases:
    """Never writes anywhere in the build: drafts stay in our store with
    filed=false. In a pilot this submits only after a specialist decides
    open_complaint (C8)."""

    def __init__(self, down: bool = False):
        self.down = down

    def submit_draft(self, case_ref: str, body: dict) -> str:
        raise NotImplementedError("no write to MoHRE systems in the build")
