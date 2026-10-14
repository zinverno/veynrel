---
synthetic: true
related:
  - "[[note-039]]"
---
# Can an encrypted backup be recovered?

Encryption protects backup contents only if the recovery secret remains available to the owner. Store a recovery copy of that secret separately from the machine and verify that the documented unlock procedure works on a clean test environment. A successful upload or copy does not prove decryptability.

Restore a small representative sample to a separate location, open it and compare checksums. Include filenames with non-ASCII characters and a recently changed file. Record the backup generation used. The test should exercise the real recovery path, not merely confirm that an archive file exists.
