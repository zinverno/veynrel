# Journal Recovery native acceptance

This is the original acceptance for `a0b7149`. See the
[Undo blocker follow-up](journal-undo-blockers-native.md) for the subsequent fix,
current artifact hashes and targeted native results.

**PASS**, 2026-10-17. Isolated synthetic vault/profile; Obsidian **1.13.7-2**,
Electron **43.6.0**, Linux desktop. No personal vault, real credential or paid provider
request. The existing fake Relationship Analyzer response supplies plans; actual
Apply/Undo use native `Vault.process` and the native `DataAdapter`.

Reproduce with a **new** temporary directory:

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-journal-NEW \
  --relationships --taxonomy --tag-recommendations --change-planner --journal-recovery
```

The harness owns its child process/profile and sends SIGKILL only to that process.
It uses CDP port 9274. Never point these fault-injection helpers at a personal vault.

## Exact artifacts and checks

The tested plugin copies were byte-compared to the original `a0b7149` build:

| Artifact | SHA-256 |
| --- | --- |
| `main.js` | `b4dcd22cb66665fce22ae24952a34d72ff26ddb94c447870a96f5eec6191ee0a` |
| `styles.css` | `7c6d353ef5952e4b305265bf163bfc24f2852c6ce71b1cbb6ef40da1b04ee05f` |
| `manifest.json` (unchanged) | `1d701d48f24d7303b0f9c1657756260f9f72b3227a07bedeb239c64bd55a8282` |

[Machine-readable report](journal-recovery-evidence/report.json),
[evidence checksums](journal-recovery-evidence/sha256.json).
**314 assertions**: Pair Inspector 18, Relationship Analyzer 51, Taxonomy 28,
Tag Recommendations 118, Change Planner 51, existing Safe Apply/Undo 23, new recovery 25.
The final process's network counter is zero; earlier stages assert their own IO
boundaries. This is not a claim that the entire scenario writes no notes: the existing
Apply/Undo deliberately writes synthetic notes, and the harness injects corruption.

| New acceptance case | Observed result |
| --- | --- |
| Real add-link Apply → partial `backup.json` → restart | Local incident, exact `after`, surviving validated copy, Undo unavailable. |
| Source/target blocking versus independent paths | Shared executor's native blocker check refuses either affected path and accepts unrelated paths. Automated tests additionally exercise full Apply review for these cases. |
| Separate preview across RU/EN, both themes and 1200/390 px | No Markdown/journal changes; safe literal text, diff, hashes, scope, translated controls, no horizontal overflow in review/history. |
| Keyboard focus and final consent | Separate confirmation receives native keyboard focus; explicit click records decision. |
| Resolution → process restart | `resolved` remains distinct from Apply/Undo, damaged originals stay visible, no automatic Undo/replay. |
| Original evidence | Every original journal file's SHA-256 remains identical; source remains exact saved `after`. |
| Independent new operation | Actual existing native Apply succeeds with older incidents retained. |
| SIGKILL inside intent write | Adapter writes only first 24 characters, then waits; process is killed. Partial attempt cannot waive block; a fresh reviewed UUID attempt succeeds after restart. |
| SIGKILL inside commit write | Same real partial write/pause/kill; no waiver; new uniquely named confirmation succeeds without touching the old attempt. |
| SIGKILL after full commit before read-back acknowledgement | Restart validates complete decision; no Markdown replay and no Undo. |
| Later user edit | Source matches neither expected version; manual resolution and Undo unavailable, validated backup retained. |

The existing Safe Apply phase also kills/restarts at prepared-before-process,
after-process-before-applied and after-undo-before-undone. Ordinary post-restart Undo,
embed replacement preserving a contextual example, and native open-editor refusal
remain covered.

An intermediate full run failed during the older Change Planner harness's cleanup:
a delayed vault/metadata event invalidated the newly opened unrelated Pair Inspector.
The product correctly reported a stale snapshot. Cleanup now waits for the rename's
metadata event and follows the visible **Refresh** flow if another late event arrives;
all original product assertions remain. The complete final run above passed.

## Screenshots

| Language | Light 1200 | Light 390 | Dark 1200 | Dark 390 |
| --- | --- | --- | --- | --- |
| EN | [Review](journal-recovery-evidence/journal-en-theme-light-1200.png) | [Review](journal-recovery-evidence/journal-en-theme-light-390.png) | [Review](journal-recovery-evidence/journal-en-theme-dark-1200.png) | [Review](journal-recovery-evidence/journal-en-theme-dark-390.png) |
| RU | [Review](journal-recovery-evidence/journal-ru-theme-light-1200.png) | [Review](journal-recovery-evidence/journal-ru-theme-light-390.png) | [Review](journal-recovery-evidence/journal-ru-theme-dark-1200.png) | [Review](journal-recovery-evidence/journal-ru-theme-dark-390.png) |

- [Diagnostics](journal-recovery-evidence/journal-diagnostics.png)
- [EN narrow confirmation](journal-recovery-evidence/journal-en-confirmation-390.png), [RU narrow confirmation](journal-recovery-evidence/journal-ru-confirmation-390.png)
- [Resolved history after restart](journal-recovery-evidence/journal-resolved-after-restart.png)
- [SIGKILL during intent](journal-recovery-evidence/journal-killed-intent.png), [SIGKILL during commit](journal-recovery-evidence/journal-killed-commit.png)
- [Later user edits: refusal](journal-recovery-evidence/journal-refusal.png)

## Automated gates and limits

`npm test`: **3266 passed / 128 files**. `npm run typecheck`, `npm run lint`,
`npm run build`, `npm run audit:proposals` (**5/5 mutations killed**) and
`git diff --check` passed. Lint retains the pre-existing `api.ts:404` streaming-fetch
warning, with zero errors. The audit's child Vitest could not run in the sandbox;
the identical command passed outside it, with every mutated file restored.

The native cases validate a desktop implementation and process interruption, not
physical power loss or `fsync`. Not tested: mobile hardware, other operating systems,
screen readers, custom themes/editors, concurrent independent vault processes, remote
sync conflict handling or live providers. No multi-file restoration, journal cleanup
or automatic repair is implemented. See [the protocol and limits](journal-recovery-v1.md).
