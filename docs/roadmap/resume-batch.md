# Resume Batch — deferred owner requirement

The owner deferred Resume Batch from early 2.4.0 on 2026-11-18. It requires a separately commissioned PR. No implementation or later release date is confirmed. [Current scope decision](../community-version-policy.md).

## Current boundary

Legacy `runBatchProcessing` processes its supplied file list; it has no durable
selection of only previously unfinished notes. Regenerating can insert repeated
card lines in Markdown. Recall preserves schedules for identical card identities;
that is not generation deduplication. Studio has operation history, but not a
complete resumable interrupted folder run. These are distinct responsibilities.

## Required contract and acceptance

- Durable per-file receipts, job identity and a fingerprint of the original
  learning material. Do not confuse generated cards with the material fingerprint.
- Separate `success`, `failed`, `incomplete`, `cancelled` and `partial/unknown`
  outcomes. A restart must not infer success merely from a request finishing.
- **Resume unfinished processing** offers only unfinished files and files requiring
  verification. Changed material invalidates a previous successful fingerprint.
- **Supplement existing cards** is a different, explicitly chosen mode; it must
  not be confused with retrying or resuming the original job.
- When cards reached Markdown but Recall import failed, retry the import of those
  saved cards, not paid generation. Verify the saved source and import outcome.
- Integrate with Batch, Studio and the existing Recall identities/schedules,
  operation ownership and recovery; no second FSRS or competing journal system.
- No automatic paid retries. Any new generation needs the existing explicit
  material selection, recipient disclosure, consent and limits.
- Test interruption before/after Markdown write and Recall import, changed source,
  partial output, cancellation, restart and the distinction between the two modes.
  Preserve original bytes and schedules; report uncertain states honestly.

R05.2 changes neither Legacy Batch nor Recall data. The implementation unit and
its dependencies must be assigned explicitly before release acceptance.
