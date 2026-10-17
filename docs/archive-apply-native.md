# Archive Apply & Undo v1 native acceptance

**PASS**, 2026-10-18. Linux, Obsidian **1.13.7**, Electron **43.6.0**.
PR #90 was verified merged into current main
`dc2188791a99581277404d1a73cbb9ad37a192b0` before branching.

The final run uses a new isolated synthetic vault/profile at
`/tmp/pair-inspector-archive-apply-20261018-final7`. Prerequisites go through ordinary
Relationship Analyzer consent, MergePlan, real Merge Apply and preservation
review. Only the prerequisite model response is replaced with a deterministic
repository fixture. Archive planning, Apply and Undo use no model requests.
No personal vault, credentials or paid provider is involved.

## Reproduce

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-archive-NEW --archive-planner --archive-apply
```

The directory must be new. The harness owns its process and CDP port 9274.
SIGKILL targets only that owned process; restarted files and journals are checked
before opening history. The isolated profile disables the app updater to retain
the installed runtime. Product settings and release metadata are unchanged.

## Results and evidence

Final run: **116 assertions** — Pair Inspector **18**, Archive Planner **40**,
Archive Apply/Undo **58**. **34 screenshots** are retained. Counts include repeated locale/theme and preservation
assertions, not that many distinct features. Disk comparisons and readiness
assertions also run inside the harness.

- [Final combined report](archive-apply-evidence/report.json)
- [Earlier successful Apply/Undo run](archive-apply-evidence/apply-only-report.json)
- [Evidence and installed artifact SHA-256](archive-apply-evidence/sha256.json)

Installed `main.js`, `styles.css` and `manifest.json` are byte-compared with the
repository build. The report records the build SHA-256; the manifest hashes every
retained screenshot/report and the three installed artifacts.

| Native case | Observed result |
| --- | --- |
| No YAML / existing safe YAML | Exactly the two Veynrel properties are inserted. Original comments, user properties, body and links survive. |
| Both canonical directions, Unicode/CRLF | EN and RU complete the entire chain; disk buffers match both original notes after all Undo steps. |
| Separate consent / cancellation | Complete before/after, unchanged canonical, diff, parent ID/hash, fragment decisions and warnings are visible. Opening/cancelling writes neither Markdown nor journals and requests no completion. |
| RU/EN × light/dark × 1200/390 | No horizontal overflow or untranslated archive keys; confirmation is activated with the keyboard. |
| Actual write | Only secondary reaches native `Vault.process`; canonical, unrelated Markdown and the parent Merge journal remain byte-identical. |
| Restart with active archive | History recovers the applied state; parent Merge Undo is absent and direct invocation refuses. Neither note changes. |
| Archive Undo after restart | Separate inverse preview, then exact original secondary restored through native `Vault.process`; canonical remains unchanged. |
| Another restart, then Merge Undo | Complete archive receipts permit separate parent Undo; both original notes are restored despite changed secondary mtime. |
| Edits to either note after consent / before Undo | Automatic action refuses and preserves the edited bytes. |
| Main/popout editors, either note | Archive consent refuses while an affected note is open. Popouts are real native windows. |
| Global incident in any of four journal families | An incident introduced after consent prevents the write. |
| Parent backup damage / backup-copy failure | Automatic action refuses; no secondary process call occurs. Evidence remains. |
| Different text inside actual process callback | Exact-before check refuses without saving the altered callback value. |
| Competing confirmations and Undo/resolution | A held archive process owns the shared lock; the second confirmation and all older Undo/resolution services refuse as busy. Unit tests additionally cover Single/Multi/Merge review entry points. |
| Planner regression | Full original read-only matrix passes, including incomplete parent, changed notes, YAML/property refusal, dependencies, cancellation, reselection and closing during a read. The planner only opens a separate execution review. |

## SIGKILL matrix

Each case compares both selected notes, unrelated Markdown and parent journal
bytes across restart. Startup never writes archive recovery data or notes.

| Point | Observed after restart |
| --- | --- |
| Before prepare starts / operation directory creation | No archive entry or Markdown change; parent Merge remains eligible for its own review. |
| After first copy | Prepared with damaged evidence; no unsafe Undo. |
| After both copies | Prepared; no automatic continuation. |
| Immediately before Markdown | Prepared; no Markdown change. |
| After secondary write, before applied | Recovered applied; explicit Archive Undo restores original text, but missing applied receipt blocks Merge Undo. |
| During applied marker | Applied text, damaged journal; Undo blocked. |
| After complete undo-intent | Recovered applied; fresh explicit Undo completes the provable chain. |
| After restoration, before undone | Recovered undone text; no repeat Undo and parent Merge Undo blocked. |
| During undone marker | Restored text, damaged evidence; parent Merge Undo blocked. |

Full reversibility is demonstrated only for an intact acknowledged chain.
The separate unit fault before the first record write, after directory creation,
confirms that an empty operation directory remains a damaged global blocker.
Missing/torn receipts are never synthesized. See the
[protocol and exact parent mtime exception](archive-apply-v1.md#archive-undo-and-parent-merge-undo).

## Screenshots

| Language | Light 1200 | Light 390 | Dark 1200 | Dark 390 |
| --- | --- | --- | --- | --- |
| EN | [Review](archive-apply-evidence/archive-apply-en-theme-light-1200.png) | [Review](archive-apply-evidence/archive-apply-en-theme-light-390.png) | [Review](archive-apply-evidence/archive-apply-en-theme-dark-1200.png) | [Review](archive-apply-evidence/archive-apply-en-theme-dark-390.png) |
| RU | [Проверка](archive-apply-evidence/archive-apply-ru-theme-light-1200.png) | [Проверка](archive-apply-evidence/archive-apply-ru-theme-light-390.png) | [Проверка](archive-apply-evidence/archive-apply-ru-theme-dark-1200.png) | [Проверка](archive-apply-evidence/archive-apply-ru-theme-dark-390.png) |

- Exact diff: [EN](archive-apply-evidence/archive-apply-diff-en.png), [RU](archive-apply-evidence/archive-apply-diff-ru.png).
- Final consent: [EN](archive-apply-evidence/archive-apply-confirm-en.png), [RU](archive-apply-evidence/archive-apply-confirm-ru.png).
- Separate Undo preview: [EN](archive-apply-evidence/archive-undo-success-en.png), [RU](archive-apply-evidence/archive-undo-success-ru.png).
- Parent Undo permitted after archive restoration: [EN](archive-apply-evidence/archive-chain-en.png), [RU](archive-apply-evidence/archive-chain-ru.png).
- Recovery: [missing applied](archive-apply-evidence/archive-recovery-after-write.png), [torn applied](archive-apply-evidence/archive-recovery-torn-applied.png), [restored without undone](archive-apply-evidence/archive-recovery-undo-after-write.png), [torn undone](archive-apply-evidence/archive-recovery-torn-undone.png).
- Refusals: [changed canonical](archive-apply-evidence/archive-refusal-canonical-consent.png), [changed secondary before Undo](archive-apply-evidence/archive-refusal-secondary-undo.png), [real popout](archive-apply-evidence/archive-editor-true-1.png).

## Harness failures and corrections

The first run selected a before/after element in the underlying history rather
than the foreground Undo modal. Selectors now explicitly scope to
`.ai-archive-apply`. The [failure report](archive-apply-evidence/harness-selector-failure.json)
is retained.

A later run timed out opening history. An isolated diagnostic measured about
796 ms for Merge history and 420 ms for Archive history; it did not prove the
cause of that timeout. Read-only history now parses each journal once per call,
without lending that snapshot to consent or execution. A regression test verifies
fresh refusal when journal damage occurs after history.

Combined runs exposed a separate, reproducible native focus race: rapidly closing
Settings can leave Obsidian's `activeWindow` referring to its already closed
popout while the main document has focus. A real click does not repair it.
The harness reopens Settings, waits for its actual live window to receive focus,
then closes it normally and waits for the main window. It never overwrites focus
globals or skips product checks. History also rechecks focus immediately before
dispatching its command. Retained evidence:

- [Original history timeout](archive-apply-evidence/harness-history-failure.json), [timing diagnostic](archive-apply-evidence/history-timing.json).
- [Combined-run timeout](archive-apply-evidence/harness-combined-failure.json), [focus refusal](archive-apply-evidence/harness-focus-failure.json).
- [Closed active window](archive-apply-evidence/focus-failure.json), [reproduction](archive-apply-evidence/focus-race-diagnostic.json), [native reopen/close correction](archive-apply-evidence/focus-reopen-diagnostic.json).

## Automated checks and limits

`npm test`: **3643 tests / 140 files passed**. Typecheck, lint, build,
`audit:proposals` (**5/5 mutations killed**) and `git diff --check` passed.
Lint retains only the existing streaming `fetch` warning in `api.ts`.
The proposal audit was rerun outside the restricted sandbox after its inner
test process returned no output. The CI workflow is unchanged.

Unit/fault tests additionally cover runtime identity, ctime/mtime/size, cache and
incoming-dependency drift, all scoped journal blockers, stable IDs and repeated
operations, public-preview tampering, checksum-valid unsupported records,
missing receipts, later edits restored to the same text, and late corruption
during parent Merge Undo. Independent source review found no remaining required
security or regression fixes.

This verifies Linux desktop. 390 px is desktop emulation, not physical mobile.
Other OSes, screen readers and custom themes are untested. Network instrumentation
covers fetch/XHR and deterministic completion counts, not every transport.
The shared owner does not exclude independent processes or sync clients.
No ACID, filesystem atomicity, fsync or semantic completeness is claimed.
