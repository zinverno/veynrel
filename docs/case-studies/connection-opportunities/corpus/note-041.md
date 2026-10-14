---
synthetic: true
---
# A consistent paginated export

A cursor prevents positional drift but does not freeze records that are updated or removed during a long export. Pin a database snapshot or an immutable dataset version and bind every continuation token to that version, the filters and a unique sort order. Reject a token whose snapshot has expired rather than silently switching views.

For append-only data, a captured upper watermark may suffice if its assumptions are explicit. A timestamp alone is not enough when equal timestamps or backdated inserts are possible. Store export metadata next to the generated files so completeness can later be checked.
