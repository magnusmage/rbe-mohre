"""Which workflow node may call which tool, and which actions are
reviewer-only. The same mapping lives in agent/ (tool_configs); a unit test
fails if they drift apart. If you add a tool, change registry, agent config
and main.py in the same pull request.
"""
AGENT_TOOLS = {"verify_session", "check_wage", "check_payment_timing", "check_settlement",
               "record_allegation", "draft_complaint", "send_to_review", "transfer_to_human"}

NODE_TOOLS = {
    "disclosure":    set(),
    "verify":        {"verify_session", "transfer_to_human"},
    "wage_wps":      {"check_wage", "check_payment_timing", "record_allegation",
                      "transfer_to_human"},
    "entitlement":   {"check_settlement", "transfer_to_human"},
    "evidence_case": {"record_allegation", "draft_complaint", "send_to_review",
                      "transfer_to_human"},
}

REVIEWER_ONLY = {"decide"}

DECISIONS = {"uphold_information", "open_complaint", "refer", "request_more"}
