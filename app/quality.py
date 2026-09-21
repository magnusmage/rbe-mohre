"""Post-call grounding: rule IDs and AED amounts the agent spoke that no tool
returned on that call. Zero ungrounded is an evaluation target.

Known limit: the regex only catches amounts written as ``AED 1000.00``.
Transcripts contain speech ("one thousand dirhams"), so normalise spoken
numbers before running this, or the metric under-reports.
"""
from __future__ import annotations

import re

RULE_ID = re.compile(r"\b(?:WPS-\d{3}-\d{4}|EOS-FDL33-\d+|CONTRACT-VS-WPS)\b")
AMOUNT = re.compile(r"AED\s?([\d,]+\.\d{2})")


def ungrounded(agent_text: str, tool_results: list[dict]) -> dict:
    blob = " ".join(str(r) for r in tool_results)
    rules_ok = set(RULE_ID.findall(blob))
    amts_ok = set(AMOUNT.findall(blob))
    return {"rule_ids": set(RULE_ID.findall(agent_text)) - rules_ok,
            "amounts": set(AMOUNT.findall(agent_text)) - amts_ok}
