# Studio safety, persistence and recovery

## Actual storage

All paths are relative to the current vault:

```text
<Vault.configDir>/plugins/<plugin-id>/studio/
  recipes.json
  recipe-backups/<uuid>.json
  recipe-original-<uuid>.json
  recipe-stage-<uuid>.json                 # retained if staging is interrupted
  runs/<uuid>/start.json
  runs/<uuid>/finish.json
  operations/<uuid>/record.json
  operations/<uuid>/backup.json
  operations/<uuid>/<index>-apply-intent.json
  operations/<uuid>/<index>-applied.json
  operations/<uuid>/<index>-undo-intent.json
  operations/<uuid>/<index>-undone.json
  operations/<uuid>/<index>-skipped.json  # explicit acknowledgment of a non-written intent
```

The library envelope is `{schemaVersion:1,recipes:[...]}`. Its separate queue rechecks exact old bytes, writes/verifies a unique staging file, preserves the old raw file both as a verified backup and a renamed original, renames the stage into place, then rereads it. It never participates in `saveSettings` or writes `data.json`. There is no automatic empty replacement of corrupted/unknown-version data. A missing primary with retained backups also blocks saves. The library offers an explicit validated-backup restore and keeps the displaced corrupt original. If no valid backup is available, preserve this folder for manual repair; the UI does not discard evidence.

Run receipts contain ID, recipe ID, provider/model, selected paths and preparation time. They contain no API key, note bodies or request bodies. Only Apply persists full before/after source content. Reviews and generated proposals which were never applied are memory-only. A receipt without an applied operation is shown as interrupted after restart if its review was lost. No generation or Apply can resume from such a receipt.

Operation records have schemaVersion 1, operation `studio_transform`, UUID, timestamp, recipe ID/version and an ordered changes array. Each entry includes canonical path, creation/modification metadata, byte size, exact before/after strings, SHA-256 hashes and action. Record and backup must both validate and agree. Markers bind operation ID, index, kind, record hash, creation/modification metadata, bytes and content hash. Unknown files, malformed markers, disagreeing copies, unsupported versions and bad ordering mark an operation journal damaged. Damage blocks all Studio note mutations, including unrelated Undo, until evidence is repaired manually outside the executor.

Storage is local plaintext. Operation backups can contain sensitive note content and can be included by the user's backup/Sync tools. There is no automatic retention cleanup, encryption or cloud recipe sync. Repeated library edits retain originals and backups; large histories increase disk usage and inspection time. Preserve relevant records before manually archiving old Studio data; deleting evidence removes recovery capability.

## Apply and Undo guarantees

1. No note writes during library browsing, import, selection, preparation, consent or generation.
2. The exact saved sources, validated recipe, parameters, provider settings and outgoing bodies are fixed at preparation. Model-setting changes before sending invalidate consent. The runner sequentially rechecks each saved source immediately before sending it; cancellation starts no next request. Sent requests may finish or be billed even after local cancellation.
3. Responses must be nonempty, bounded, free of invalid controls and have an explicit normal provider completion. This verifies transport/shape, not factual accuracy, completeness of meaning or quality. There are no automatic retries or model repair requests.
4. Review is deeply frozen and only literal text/diff is displayed. No Markdown renderer, HTML, remote image, embed or model-controlled tool runs in Studio. Applying Markdown can give it the usual behavior of a note when later opened by Obsidian or other plugins; inspect it before acceptance.
5. Only separately selected successful rows can be applied. Unchanged results are skipped. Each run is consumed once; concurrent confirmations are refused, and a repeated confirmed Apply returns the existing result rather than writing again.
6. Before any note write, Studio creates and rereads both full operation copies, checks all journal blockers, saves/verifies that file's intent, rereads the exact saved note, rechecks the journal, and guards file identity, path, creation/modification/size metadata and editors. The complete content is compared again inside the existing `Vault.process` critical section. The shared guard rejects affected open views, including saved, unsaved, deferred and popout editors; close them after saving.
7. After `Vault.process`, the source is reread and must have the exact expected contents and original in-process identity. Only then is the receipt written and verified. A process/disk failure once the write has been dispatched is `unconfirmed`, never success. Remaining files stop on serious write/storage errors; previous evidence remains intact. There is no multi-file transaction.
8. Outcomes are `applied`, `skipped`, `conflict`, `failed`, `unconfirmed`. Cancellation after dispatch still observes and records the issued write, then starts no next file. The Apply dialog exposes its own Stop control.
9. Undo first creates a fresh one-use review. Current content must equal that operation's full result and match its confirmed creation/modification/byte receipt. Later user edits, including same-text edits with a new modification time, block Undo. At execution, evidence and saved source are checked again, Undo intent is persisted/verified, all guards are repeated inside `Vault.process`, and restoration is reread before the `undone` receipt. Undo never calls a model.

`Vault.process` supplies the existing in-process content check; it is not an OS lock. Exact identity survives a running session as a TFile reference plus metadata. After restart the public API provides path/creation metadata, contents and receipts, not a stable inode identity. Deliberate replacement preserving all metadata cannot be distinguished. Other processes, Sync, external tools or queued editor saves outside the guarded window are not globally transactional. Other Veynrel workflows keep their existing owners and contracts; stale exact-content checks prevent blind overwrites, rather than a new global lock changing legacy behavior.

**Durability boundary:** Obsidian's public DataAdapter offers write completion and readback, not a portable fsync/directory-fsync guarantee. Redundant verified copies support process-crash recovery; they do not prove power-loss, device-failure or cross-process atomic durability. Both copies are on the same storage. Keep normal vault backups. No universal rollback is claimed.

## Restart and manual recovery

Opening Studio never automatically reads operation participants or repairs anything. Clicking History performs read-only inspection of recorded paths. It does not repeat LLM calls or note writes.

| Evidence and current note | Available action |
| --- | --- |
| Confirmed applied receipt, exact current result and metadata | Fresh Undo review → separate confirmation. |
| Apply intent, no receipt, exact result, matching creation identity | Explicit acknowledgment of observed applied state; writes a receipt only. Then a separate Undo can be reviewed. |
| Apply intent, no receipt, exact original with original metadata | Explicit acknowledgment as skipped; writes a marker only. |
| Undo intent, no terminal receipt, exact restored original | Explicit acknowledgment as undone; no second note write. |
| Undo intent, original applied result still exactly matches its receipt | A new explicit Undo review may retry restoration after all guards. Never automatic. |
| No intent and exact original | Skipped; no restoration needed. |
| Missing, renamed, changed identity/content/receipt, or open editor | Refusal with explanation; resolve the source/editor conflict and refresh. No forced overwrite. |
| Damaged record, copy, marker or unexpected journal structure | Refusal. Preserve the whole Studio directory. No repair or rollback is automatically authorized from one surviving copy. |

Manual acknowledgment is bound to the reviewed journal evidence and exact fresh saved note; it changes only the journal. Closing an unconsumed confirmation discards it. Historical receipts remain even if a later edit makes an operation's current participant no longer match; current-state conflicts do not erase earlier evidence.
