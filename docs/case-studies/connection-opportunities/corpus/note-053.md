---
synthetic: true
---
# Invalidating a cached view

A cache entry represents a particular input revision. After the underlying record changes, either remove the entry or write it under a new revision key. A short expiration time limits staleness but does not prove immediate consistency.

Watch for a slow old computation publishing after a newer update. Checking the expected revision when storing the result can reject that stale publication. This is related to concurrency control, although an in-process cache does not automatically enforce authority at an external storage service. Metrics should distinguish misses, evictions and rejected stale writes.
