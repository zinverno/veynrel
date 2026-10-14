---
synthetic: true
---
# Storing identical content once

Content-addressed storage hashes file bytes and keeps one blob for identical content. Several logical documents can refer to that blob. Reference counts or a reachability scan determine when an unreferenced blob may be removed.

This deduplicates storage, not business operations. Two commands with identical bodies may represent two intended actions, while a retried command may have a different timestamp. Hash collisions and normalization rules require explicit treatment. A file manifest preserves names and metadata independently of the blob identity.
