"""Persistence: sqlite3 now, Postgres later, same method names.

DATA layer, standard library only. The audit table is append-only by database
trigger; even our own code cannot edit or delete it (invariant 6). Writes are
serialised with a lock because FastAPI runs sync endpoints in a thread pool.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time

SCHEMA = """
CREATE TABLE IF NOT EXISTS call_session (
  conversation_id TEXT PRIMARY KEY, worker_id TEXT, case_ref TEXT,
  verified INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0, consent_case TEXT, callback_consent INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS allegation (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_ref TEXT NOT NULL,
  period TEXT, statement TEXT NOT NULL, at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS draft (
  draft_ref TEXT PRIMARY KEY, case_ref TEXT NOT NULL, body_json TEXT NOT NULL,
  worker_confirmed INTEGER NOT NULL, filed INTEGER NOT NULL DEFAULT 0, at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS review_item (
  review_ref TEXT PRIMARY KEY, case_ref TEXT NOT NULL, conversation_id TEXT NOT NULL,
  tier TEXT NOT NULL, summary TEXT NOT NULL, package_json TEXT NOT NULL,
  decision TEXT, decided_by TEXT, decided_at REAL, at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS transcript (
  conversation_id TEXT PRIMARY KEY, body_json TEXT NOT NULL, at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS audit_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at REAL NOT NULL, actor TEXT NOT NULL,
  action TEXT NOT NULL, conversation_id TEXT, case_ref TEXT, result TEXT NOT NULL, detail TEXT);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_event
  BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_event
  BEGIN SELECT RAISE(ABORT,'append-only'); END;
"""


class Store:
    def __init__(self, path: str = ":memory:", workers: dict | None = None,
                 rules: dict | None = None):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self.db.executescript(SCHEMA)
            self.db.commit()
        # Synthetic fixtures and rule parameters, loaded by the composition
        # root (main.py or the tests). The service reads records through the
        # adapter Protocols, not from here.
        self.workers: dict = workers or {}
        self.rules: dict = rules or {}
        self._seq = 0
        # Adapter attachment points (C6/C7): set by the composition root
        # (main.py) or by tests; service._adapters fills in synthetic
        # defaults when left as None.
        self.contracts = None
        self.wps = None

    # ------------------------------------------------------------- plumbing
    def _w(self, sql: str, args=()):
        with self._lock:                     # one writer at a time
            cur = self.db.execute(sql, args)
            self.db.commit()
            return cur

    def _ref(self, prefix: str) -> str:
        self._seq += 1
        return f"{prefix}-{int(time.time())}-{self._seq:04d}"

    # -------------------------------------------------------------- session
    def session(self, conversation_id: str) -> dict | None:
        r = self.db.execute("SELECT * FROM call_session WHERE conversation_id=?",
                            (conversation_id,)).fetchone()
        return dict(r) if r else None

    def start_session(self, conversation_id: str) -> None:
        self._w("INSERT OR IGNORE INTO call_session(conversation_id) VALUES (?)",
                (conversation_id,))

    def bind(self, conversation_id: str, worker_id: str, case_ref: str) -> None:
        self._w("UPDATE call_session SET worker_id=?, case_ref=?, verified=1, consent_case=? "
                "WHERE conversation_id=?", (worker_id, case_ref, case_ref, conversation_id))

    def fail_attempt(self, conversation_id: str) -> int:
        self._w("UPDATE call_session SET attempts=attempts+1 WHERE conversation_id=?",
                (conversation_id,))
        s = self.session(conversation_id)
        if s and s["attempts"] >= 2:
            self._w("UPDATE call_session SET locked=1 WHERE conversation_id=?",
                    (conversation_id,))
        return (s or {}).get("attempts", 0)

    def set_callback_consent(self, conversation_id: str, consent: bool) -> None:
        self._w("UPDATE call_session SET callback_consent=? WHERE conversation_id=?",
                (1 if consent else 0, conversation_id))

    # ----------------------------------------------------------- allegations
    def add_allegation(self, case_ref: str, period: str | None, statement: str) -> None:
        self._w("INSERT INTO allegation(case_ref, period, statement, at) VALUES (?,?,?,?)",
                (case_ref, period, statement, time.time()))

    def allegations(self, case_ref: str) -> list[dict]:
        return [dict(r) for r in self.db.execute(
            "SELECT period, statement, at FROM allegation WHERE case_ref=? ORDER BY id",
            (case_ref,))]

    # ---------------------------------------------------------------- drafts
    def create_draft(self, case_ref: str, body: dict, confirmed: bool) -> str:
        ref = self._ref("DR")
        self._w("INSERT INTO draft(draft_ref, case_ref, body_json, worker_confirmed, at) "
                "VALUES (?,?,?,?,?)",
                (ref, case_ref, json.dumps(body), 1 if confirmed else 0, time.time()))
        return ref

    def latest_draft(self, case_ref: str) -> dict | None:
        row = self.db.execute(
            """
            SELECT *
            FROM draft
            WHERE case_ref=?
            ORDER BY at DESC
            LIMIT 1
            """,
            (case_ref,),
        ).fetchone()

        if row is None:
            return None

        result = dict(row)

        if result.get("body_json"):
            result["body"] = json.loads(result.pop("body_json"))

        return result

    # ---------------------------------------------------------------- review
    def create_review(self, case_ref: str, conversation_id: str, tier: str,
                      summary: str, package: dict) -> str:
        ref = self._ref("RV")
        self._w("INSERT INTO review_item(review_ref, case_ref, conversation_id, tier, "
                "summary, package_json, at) VALUES (?,?,?,?,?,?,?)",
                (ref, case_ref, conversation_id, tier, summary, json.dumps(package),
                 time.time()))
        return ref

    def review(self, review_ref: str) -> dict | None:
        r = self.db.execute("SELECT * FROM review_item WHERE review_ref=?",
                            (review_ref,)).fetchone()
        return dict(r) if r else None
    
    def active_review(self, case_ref: str, conversation_id: str):
        row = self.db.execute(
            """
            SELECT *
            FROM review_item
            WHERE case_ref = ?
            AND conversation_id = ?
            AND decision IS NULL
            ORDER BY at
            LIMIT 1
            """,
            (case_ref, conversation_id),
        ).fetchone()

        return dict(row) if row else None

    def queue(self) -> list[dict]:
        order = ("CASE tier WHEN 'tier_2_mandatory_human' THEN 0 "
                 "WHEN 'tier_1_priority_review' THEN 1 ELSE 2 END, at")
        return [dict(r) for r in self.db.execute(
            f"SELECT * FROM review_item WHERE decision IS NULL ORDER BY {order}")]

    def decide(self, review_ref: str, decision: str, reviewer: str) -> None:
        self._w("UPDATE review_item SET decision=?, decided_by=?, decided_at=? "
                "WHERE review_ref=?", (decision, reviewer, time.time(), review_ref))

    # ------------------------------------------------------------ transcripts
    def save_transcript(self, conversation_id: str, body: dict) -> bool:
        cur = self._w("INSERT OR IGNORE INTO transcript(conversation_id, body_json, at) "
                      "VALUES (?,?,?)", (conversation_id, json.dumps(body), time.time()))
        return cur.rowcount == 1          # False -> duplicate, ignored

    def has_transcript(self, conversation_id: str) -> bool:
        return self.db.execute("SELECT 1 FROM transcript WHERE conversation_id=?",
                               (conversation_id,)).fetchone() is not None
    
    def transcript(self, conversation_id: str) -> dict | None:
        row = self.db.execute(
            "SELECT body_json FROM transcript WHERE conversation_id=?",
            (conversation_id,),
        ).fetchone()

        if row is None:
            return None

        return json.loads(row["body_json"])

    # ----------------------------------------------------------------- audit
    def audit(self, actor: str, action: str, result: str,
              conversation_id: str | None = None, case_ref: str | None = None,
              detail: dict | None = None) -> None:
        self._w("INSERT INTO audit_event(at, actor, action, conversation_id, case_ref, "
                "result, detail) VALUES (?,?,?,?,?,?,?)",
                (time.time(), actor, action, conversation_id, case_ref, result,
                 json.dumps(detail) if detail else None))

    def audit_for(self, case_ref: str) -> list[dict]:
        return [dict(r) for r in self.db.execute(
            "SELECT * FROM audit_event WHERE case_ref=? ORDER BY id", (case_ref,))]
