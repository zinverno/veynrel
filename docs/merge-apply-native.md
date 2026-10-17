# Merge Apply v1 native acceptance

**PASS**, 2026-10-17. Linux, Obsidian **1.13.7-2**, Electron **43.6.0**.
PR #88 was verified merged, with merge commit matching current main
`a55a2e5d37fd9a90902005c2560e2ed6fe2d42c4`, before branching.

All inputs were synthetic, in new isolated vaults/profiles. Real native
`Vault.process`, DataAdapter reads/writes/copies, MetadataCache, editor leaves and
popout windows were used. Only the Relationship Analyzer response was replaced
with the repository fixture, after its ordinary consent step. No personal notes,
credentials or paid requests were used.

## Reproduce

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-merge-apply-NEW \
  --merge-planner --merge-apply
```

Use a new directory with that prefix. The harness owns its Obsidian process and
CDP port 9274. SIGKILL affects only that owned process. External user edits and
backup faults are injected explicitly into the synthetic fixture. Product code
uses the ordinary executor, journal and consent/history modals.

## Evidence

The final run passed **113 assertions**: Pair Inspector **18**, Merge Planner
**52**, Merge Apply **43**. Counts include repeated language/theme/confirmation
checks, not 113 independent product features. An earlier targeted run passed
61 assertions before the final consent added the literal insertion-anchor text.

- [Final combined report](merge-apply-evidence/report.json)
- [Earlier targeted report](merge-apply-evidence/targeted-report.json)
- [Evidence SHA-256 manifest](merge-apply-evidence/sha256.json)

The installed final vault artifacts were byte-compared with the repository build:

| Artifact | SHA-256 |
| --- | --- |
| `main.js` | `7572d4e311b94a71435c062480aa067e8acc8a78ff6d2b20332ad6dcb0be15c0` |
| `styles.css`, unchanged | `7c6d353ef5952e4b305265bf163bfc24f2852c6ce71b1cbb6ef40da1b04ee05f` |
| `manifest.json`, unchanged | `1d701d48f24d7303b0f9c1657756260f9f72b3227a07bedeb239c64bd55a8282` |

| Native case | Observed result |
| --- | --- |
| Separate consent | Full expanded canonical before/after, unchanged secondary, copied ranges, literal diff and insertion anchor precede Apply. No Markdown mutation or extra completion while reviewing. Keyboard Enter confirms. |
| Both canonical directions | One paragraph copied to A; multiple paragraphs copied to B. Canonical preserves original frontmatter/links/embeds. Unicode, emoji, combining marks and CRLF are retained exactly. |
| Actual writer | Instrumented real `Vault.process` sees only canonical. Disk buffers match exact approved after and byte-identical secondary. |
| RU/EN × light/dark × 1200/390 px | Translated consent and literal previews have no horizontal overflow. Screenshots include focused confirmation. |
| Restart after success | Applied state and explicit Undo survive native process restart. Startup does not change the saved notes. |
| Undo after restart | Fresh inverse preview and confirmation restore canonical exactly; secondary stays byte-identical. History offers no repeated Undo. |
| SIGKILL after first backup | Valid first record remains visible; canonical is before/prepared. Missing second copy disables automatic Undo. |
| SIGKILL after both backups | Canonical is before/prepared. No automatic Apply or rollback. |
| SIGKILL immediately before process | Same prepared state; no Markdown mutation. |
| SIGKILL after process, before applied marker | Actual after is recognized as applied. Separate Undo succeeds after restart without an applied marker. |
| SIGKILL during applied marker | Actual after remains visible; torn marker disables automatic Undo and preserves full recovery data. |
| SIGKILL after Undo write | Actual before is recognized as undone from saved texts and undo-intent; startup performs no second write. |
| SIGKILL during undone marker | Actual before remains visible; damaged evidence is retained for manual review. |
| Backup exception | Second-copy failure causes an error before any native process call; both Markdown files remain byte-identical. |
| Later canonical or secondary edit | History reports conflict, offers no Undo and retains full recovery text. User changes remain untouched. |
| Two confirmation windows | Second confirmation refuses the busy shared executor; only one operation writes. |
| Single/multi executor overlap | Both older executors refuse while Merge holds their shared owner lock. |
| Main-window editors | Either affected note being open refuses final consent. |
| Real popout editors | Either affected note in an actual separate Obsidian window refuses final consent. |
| Older journal conflicts | A new global incident in either existing journal after consent prevents Merge dispatch. |
| Planner regression | Planning still has zero Markdown/journal/network mutations; protected blocks, context, contradictory/version claims and stale inputs retain their refusal paths. |

Every successful copy, failed backup, crash and completed Undo checks secondary
against its original disk buffer. Tests that deliberately simulate a later user
edit instead assert that edited buffer remains untouched.

An initial run stopped on a **harness selector error**: the Undo assertion selected
the underlying history preview instead of the foreground consent modal. Apply
and restart had succeeded. The selector is now scoped to `.ai-merge-apply`; no
product guard was weakened. The [failure report](merge-apply-evidence/initial-harness-failure.json)
is retained. The targeted and final combined runs completed successfully.

## Screenshots

| Language | Light 1200 | Light 390 | Dark 1200 | Dark 390 |
| --- | --- | --- | --- | --- |
| EN | [Consent](merge-apply-evidence/merge-apply-en-theme-light-1200.png) | [Consent](merge-apply-evidence/merge-apply-en-theme-light-390.png) | [Consent](merge-apply-evidence/merge-apply-en-theme-dark-1200.png) | [Consent](merge-apply-evidence/merge-apply-en-theme-dark-390.png) |
| RU | [Согласие](merge-apply-evidence/merge-apply-ru-theme-light-1200.png) | [Согласие](merge-apply-evidence/merge-apply-ru-theme-light-390.png) | [Согласие](merge-apply-evidence/merge-apply-ru-theme-dark-1200.png) | [Согласие](merge-apply-evidence/merge-apply-ru-theme-dark-390.png) |

- Diff [EN](merge-apply-evidence/merge-apply-diff-en.png), [RU](merge-apply-evidence/merge-apply-diff-ru.png).
- Confirmation and insertion anchor [EN](merge-apply-evidence/merge-apply-confirm-en.png), [RU](merge-apply-evidence/merge-apply-confirm-ru.png).
- Recovery [before write](merge-apply-evidence/merge-recovery-before-write.png), [after write](merge-apply-evidence/merge-recovery-after-write.png), [torn marker](merge-apply-evidence/merge-recovery-torn-applied.png), [after Undo](merge-apply-evidence/merge-recovery-undo-after-write.png).
- Popout refusal for [canonical](merge-apply-evidence/merge-editor-true-0.png) and [secondary](merge-apply-evidence/merge-editor-true-1.png).

## Automated checks and limits

`npm test`: **3538 tests / 136 files passed** on the final implementation.
Focused tests cover both directions, one/multiple paragraphs, Unicode/CRLF,
frontmatter/link preservation, protected regions, stale paths/identities/stats,
cache/resolver/incoming changes (including beyond the inspector's first 100),
consent cancellation, exact callback conflicts, source edits before/after Undo
consent and during intent IO, backup/read-back/marker faults, corrupt records,
all executor lock directions, journal conflicts at every consent/write boundary,
replay, public-preview tampering and passive startup. Existing link executors and
journal tests remain passing. Fault tests assert secondary byte equality and that
only canonical reaches process.

Typecheck, lint, production build, `audit:proposals` (**5/5 mutations killed**) and
`git diff --check` passed. Lint retains only the pre-existing `api.ts:404` streaming
fetch warning. The first full unit run under parallel build/audit load timed out
in an existing release-compatibility case; that file passed separately, followed
by two complete passing full-suite runs without increasing timeouts. CI runs the
repository's unchanged verification and npm 10/11 scanner-install jobs on the PR.

The independent source review found one final-read journal race. The executor now
checks its own record and all journal blockers after the final native source read,
then runs synchronous source/editor/dependency guards before process. Regression
faults cover all three journal families and damage to the operation's own backup.
The subsequent review reported no remaining required findings.

This is Linux desktop evidence, including real popout editors. A 390 px desktop
viewport does not establish physical mobile acceptance. No other OS, screen reader,
custom theme, paid provider quality or semantic completeness was tested. Network
counters observe fetch/XHR and fake completion counts, not every possible transport.
SIGKILL is not physical power loss. There is no ACID, filesystem atomicity, fsync
or exclusion of external processes/plugins/sync clients. Torn markers intentionally
require manual review rather than automatic Undo. See the [protocol limits](merge-apply-v1.md).
