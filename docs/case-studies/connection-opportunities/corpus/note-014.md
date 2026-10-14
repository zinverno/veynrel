---
synthetic: true
related:
  - "[[note-015]]"
---
# SQLite readers during normal writes

Write-ahead logging lets a read transaction see a stable snapshot while another connection appends changes. Enable WAL mode deliberately, keep read transactions short, and let checkpointing reclaim the log when readers release their snapshots. This provides live queries without copying database files or holding a long exclusive lock against writers.

There is still only one writer at a time. Long readers can prevent checkpoint progress and make the WAL file grow. Treat the database, WAL and shared-memory files as a coordinated system; copying one live file is not a backup procedure. Measure transaction duration before tuning timeouts.
