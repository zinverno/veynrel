---
synthetic: true
---
# Reclaiming space in SQLite

Deleting rows usually leaves pages available for reuse inside the database file. VACUUM rebuilds the database to compact it, requiring temporary disk space and coordination with other activity. It is a maintenance operation, not a way to make continuous readers coexist with writes.

Schedule compaction after checking file growth and operational needs. Automatic vacuum settings have different overhead and must be chosen deliberately. Keeping a small file on disk is not always worth a disruptive rebuild. Backups and integrity checks serve separate purposes.
