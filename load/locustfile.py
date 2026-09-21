"""Load test: tool endpoints at 2x annualised 80084 volume (Box M KPI 3).

Run:  locust -f load/locustfile.py --host http://localhost:8000
Set AGENT_TOOL_TOKEN in the environment first. Report throughput, p95 and
error rate; the target is measured, not asserted.
"""
import os
import uuid

from locust import HttpUser, between, task

H = {"Authorization": f"Bearer {os.environ['AGENT_TOOL_TOKEN']}"}


class ToolCaller(HttpUser):
    wait_time = between(0.1, 0.5)

    def on_start(self):
        self.conv = "load-" + uuid.uuid4().hex[:10]
        self.client.post("/tools/verify_session", headers=H, json={
            "conversation_id": self.conv, "worker_id": "WRK-1001",
            "case_ref": "LAB-1001", "pin": "4821"})

    @task(3)
    def wage(self):
        self.client.post("/tools/check_wage", headers=H, json={
            "conversation_id": self.conv, "case_ref": "LAB-1001", "period": "2026-07"})

    @task(1)
    def timing(self):
        self.client.post("/tools/check_payment_timing", headers=H, json={
            "conversation_id": self.conv, "case_ref": "LAB-1001", "period": "2026-07"})
