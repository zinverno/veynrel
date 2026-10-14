---
synthetic: true
related:
  - "[[note-026]]"
---
# One purchase, one operation identity

Assign an idempotency key to a business operation before its first POST. Store the key with a hash of the parameters and the eventual result on the server. A retry with the same key and same parameters returns that recorded result instead of creating a second purchase. Reusing the key for different parameters is rejected.

Deduplicating identical files or comparing request bodies is insufficient: two intentional purchases can have identical details. The identity must survive a client restart. If the first response is lost, query that identity or retry only under the server's documented idempotency contract.
