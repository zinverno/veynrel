# PR #85 follow-up: shared Apply/Undo blockers

This follow-up to `a0b7149` closes the missing journal-blocker checks in Undo. It does
not change the operation/resolution formats, add another executor, or introduce
multi-file writes. The same `checkBlockers` policy now runs during Undo review,
before `undo_pending`, and again after marker IO before `Vault.process`. Consent,
source identity/ctime, exact `after`, closed editors and single-use tickets remain
required. A pending intent left by a late refusal is not a completed undo.

## Automated verification

- **16 added regressions**: unknown/global scope, all four source/target overlap
  combinations, independent Undo, new incidents after review and during marker IO,
  no Markdown/false success-marker writes, consumed confirmations, valid persisted
  resolution and invalidated resolution evidence, editor/cancellation/ctime changes
  during blocker IO.
- The initial regression run failed 13 cases on the original implementation,
  reproducing the missing gate. The final focused suite passes **115 tests**.
- Full suite: **3282 tests / 128 files**, PASS.
- Typecheck, lint, build, `git diff --check`: PASS. Only the existing streaming-fetch
  warning at `api.ts:404`; no lint errors.
- `audit:proposals`: **5/5 mutations killed**, restored tests pass. The sandbox could
  not start its child Vitest; the identical audit passed outside the sandbox.

## Targeted native acceptance

**PASS** on an isolated synthetic Linux vault/profile, Obsidian 1.13.7-2 / Electron
43.6.0. **25 assertions**: 18 existing Pair Inspector checks and 7 targeted Undo
scenarios. Real native Apply/Undo and DataAdapter IO; synthetic relationship responses
only. No real LLM calls. No personal vault was accessed.

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-undo-NEW --undo-blockers
```

| Scenario | Observed result |
| --- | --- |
| Two real applied operations share only their target; the second backup becomes partial after the first Undo preview | Final confirmation refuses without Markdown changes, `undo_pending` or `undone`. |
| Restart with that local incident | Preparing the affected Undo also refuses. |
| Third operation uses independent files | Native Undo restores exact original content; a second Undo is rejected. |
| Separately confirm resolution of the damaged operation, then restart | Undo of the intact operation succeeds. The damaged operation still has no Undo; its original and partial backup bytes remain unchanged. |
| Inject an unknown root file during the native `undo_pending` write | The second blocker check refuses before Markdown processing. The intent remains; no `undone` appears. |
| Restart with the unknown global scope | Fresh Undo review refuses; saved Markdown remains `after`. |
| Provider/network boundary | No real LLM or network request. |

The test closes child/parent history windows and waits for the shared executor's
read-only refresh to finish before reopening history. It does not weaken the busy
guard or the product's refusal checks. A broader preliminary rerun stopped at the
existing Apply-editor error-wording assertion; it was **not** counted as a passing
full native regression run. The targeted follow-up above ran independently and passed;
the earlier full acceptance remains recorded against `a0b7149`.

[Machine report](journal-recovery-evidence/undo-blockers/report.json) ·
[Evidence checksums](journal-recovery-evidence/undo-blockers/sha256.json)

- [Refusal after preview](journal-recovery-evidence/undo-blockers/undo-blocked-after-preview.png)
- [Undo after resolution](journal-recovery-evidence/undo-blockers/undo-after-resolution.png)
- [Global refusal](journal-recovery-evidence/undo-blockers/undo-global-block.png)

The installed artifacts were byte-compared to the tested working build:

| File | SHA-256 |
| --- | --- |
| `main.js` | `5dc2a22f9b5c88a63601904727ec38c4e29a978864dad5a415a99d96e44914f0` |
| `styles.css` | `7c6d353ef5952e4b305265bf163bfc24f2852c6ce71b1cbb6ef40da1b04ee05f` |
| `manifest.json` | `1d701d48f24d7303b0f9c1657756260f9f72b3227a07bedeb239c64bd55a8282` |

No physical power-loss/fsync, mobile, remote-sync or independent multi-process
concurrency guarantee is added. Journal rechecks and a note write are not one atomic
filesystem transaction. Existing conservative recovery limits remain unchanged.
