"""Regression tests for the SQLite connection strategy (D11)."""
from concurrent.futures import ThreadPoolExecutor

from app.store import Store


def test_shared_connection_is_safe_under_threaded_access(tmp_path):
    store = Store(str(tmp_path / "concurrency.db"))
    workers = 24
    audits_per_worker = 20

    def exercise_store(worker_number: int) -> str:
        conversation_id = f"load-{worker_number}"
        store.start_session(conversation_id)
        store.bind(conversation_id, "WRK-1001", "LAB-1001")

        for sequence in range(audits_per_worker):
            store.audit(
                "agent",
                "load_test",
                "ok",
                conversation_id,
                "LAB-1001",
                {"sequence": sequence},
            )

        session = store.session(conversation_id)
        assert session is not None
        assert session["verified"] == 1
        return store.create_draft(
            "LAB-1001",
            {"worker": worker_number},
            True,
        )

    with ThreadPoolExecutor(max_workers=workers) as executor:
        draft_refs = list(executor.map(exercise_store, range(workers)))

    assert len(set(draft_refs)) == workers
    assert len(store.audit_for("LAB-1001")) == workers * audits_per_worker


def test_file_database_uses_wal_and_busy_timeout(tmp_path):
    store = Store(str(tmp_path / "pragmas.db"))

    assert store.db.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert store.db.execute("PRAGMA busy_timeout").fetchone()[0] == 5000
