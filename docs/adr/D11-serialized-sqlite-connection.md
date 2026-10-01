# D11: SQLite uses one serialized connection

**Status:** accepted

The SQLite pilot retains one shared connection per control-plane process.
Every Store-managed database read, write and generated draft or review
reference passes through one threading.RLock, preventing multiple FastAPI
worker threads from using the same connection simultaneously. File databases
use WAL mode, synchronous=NORMAL and a five-second busy_timeout. Existing
public Store method names remain unchanged.

**Why.** FastAPI executes synchronous tool endpoints in a thread pool, while
check_same_thread=False only permits a connection to be used by different
threads; it does not make simultaneous access safe. Previously, writes were
locked but reads could use the shared connection while a write was in progress.
Using one connection per request would require additional request-lifecycle and
transaction management while SQLite would still permit only one writer at a
time. Serializing all access is the simplest safe strategy for the current
pilot and preserves the Store boundary for a future PostgreSQL replacement.

WAL allows other connections or processes to continue reading while this
process writes, and the busy timeout lets SQLite wait through short external
lock contention instead of immediately returning database is locked. Database
operations within one process remain serialized, so this is a safety strategy,
not the long-term production scaling strategy. If database waiting becomes
material, the Store implementation should move to PostgreSQL with a connection
pool while keeping the same public methods.
