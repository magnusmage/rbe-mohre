"""What the caller said, in a form we can check.

EDGE-adjacent but pure: standard library only. Arabic-Indic (U+0660-0669) and
Eastern Arabic-Indic / Urdu (U+06F0-06F9) digits are normalised to ASCII —
Urdu speakers commonly write the latter, and they differ (UC-09, UC-20).
"""
from __future__ import annotations

import re

_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")

WORKER_ID = re.compile(r"^WRK-\d{4}$")
CASE_REF = re.compile(r"^LAB-\d{4}$")
PERIOD = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def normalise_digits(raw: str) -> str:
    return (raw or "").translate(_DIGITS)


def normalise_ref(raw: str) -> str:
    """'wrk ١٠٠١' -> 'WRK-1001'; 'lab1001' -> 'LAB-1001'; '٤٨٢١' -> '4821'."""
    s = normalise_digits(raw).strip().upper()
    s = re.sub(r"[\s_\-]+", "-", s)
    return re.sub(r"^([A-Z]+)-?(\d+)$", r"\1-\2", s)
