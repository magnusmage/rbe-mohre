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


def test_concurrent_readers_and_writers_are_safe(tmp_path):
    store = Store(str(tmp_path / "read-write-concurrency.db"))

    conversation_id = "read-write-test"
    case_ref = "LAB-1001"

    # Prepare one verified session that reader threads can repeatedly read.
    store.start_session(conversation_id)
    store.bind(conversation_id, "WRK-1001", case_ref)

    reader_workers = 12
    writer_workers = 12
    operations_per_worker = 50

    def read_session(_: int) -> None:
        for _ in range(operations_per_worker):
            session = store.session(conversation_id)

            assert session is not None
            assert session["verified"] == 1

    def write_audits(worker_number: int) -> None:
        for sequence in range(operations_per_worker):
            store.audit(
                "agent",
                "read_write_test",
                "ok",
                conversation_id,
                case_ref,
                {
                    "worker": worker_number,
                    "sequence": sequence,
                },
            )

    with ThreadPoolExecutor(
        max_workers=reader_workers + writer_workers
    ) as executor:
        reader_futures = [
            executor.submit(read_session, worker_number)
            for worker_number in range(reader_workers)
        ]

        writer_futures = [
            executor.submit(write_audits, worker_number)
            for worker_number in range(writer_workers)
        ]

        # Calling result() also propagates any exception raised inside a thread.
        for future in reader_futures + writer_futures:
            future.result()

    # Every writer should have successfully persisted every audit.
    assert len(store.audit_for(case_ref)) == (
        writer_workers * operations_per_worker
    )
