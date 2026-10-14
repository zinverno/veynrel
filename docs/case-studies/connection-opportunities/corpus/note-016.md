---
synthetic: true
---
# Building a PostgreSQL index online

CREATE INDEX CONCURRENTLY reduces the interference with normal writes while constructing a new index. It performs extra work and has transaction restrictions. A failed concurrent build can leave an invalid index that an operator must inspect.

The procedure changes a PostgreSQL access path; it says nothing about SQLite journaling modes. Choose indexed columns from actual query patterns, and check plans after deployment. An index improves some reads at the cost of storage and additional work on writes.
