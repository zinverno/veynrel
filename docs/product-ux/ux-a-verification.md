# UX-A — Check workspace and local findings

This is the first of three stacked redesign changes, **not completion of the redesign or R06 acceptance**. Base: PR #151, `c9907f7603451c17bab70f92e1c1cc004b85d379`. Runtime source: `225d7572af33e1be808256d2d4d0e52f30b63025`; subsequent evidence/harness changes do not change the plugin assets. UX-B adds contextual operations; UX-C adds the structural mode and reorganizes Notes.

## Behavior and retained owners

| Previous route | UX-A route | Preserved behavior |
|---|---|---|
| Home, onboarding, Health, Findings | Check | One explicit local check; same-page progress/result; existing lifecycle/recovery/preferences |
| Discover and legacy map commands | Notes | Existing Review/Workbench and R06 inspectors; no geometry/ranking changes |
| Recall | Review | Existing FSRS, authoring, queue, vocabulary and persisted progress |
| Tools, Processing, History, Organization | `…` | Existing launchers and operations; contextual migration follows in UX-B |
| Studio online Community | Hidden by internal OFF switch | Local recipes, installed recipes, import/export, generation, Review, journals and recovery retained |

The main surface has three horizontal destinations and no repeated brand/vault title or Pulse. Findings are grouped by real type; source paths and recorded evidence remain literal. Search, category/state/dimension filters and 60-row pages expose the entire filtered set. Details retain ignore/snooze/reopen. Broken-link repair and pair comparison launch existing R05 owners; no fabricated positions or universal fix.

Local Health remains **whole-vault**. Choosing a folder still requires the existing explicit global-scope acknowledgement. A transient coverage receipt distinguishes unavailable content, missing cache, unsupported link target, changed source and unknown capture failure. It does not change reconciliation, inclusion rules, source validity or persistence. Historical results without retained diagnostics explicitly say their current per-file completeness is unknown. Missing embeddings do not invalidate local checks. No trend is inferred from a first/partial scan.

The empty-target diagnosis is presentation-only: the original refusal to admit any edges from that note remains. A synthetic test protects this negative control. Bounded diagnostics expose up to 100 file entries and the omitted count. Excluded totals not supplied by the existing scanner are reported as unknown.

## Engineering verification

- `npm ci --offline --no-audit --no-fund`: 356 packages, lifecycle scripts enabled, lockfile unchanged. Sandbox rejected esbuild's subprocess on the initial attempt; the authorized unsandboxed run passed.
- Full suite: **5,418 passing tests / 212 files**, versus 5,415 / 211 at the base. Obsolete wizard/Pulse presentation tests were replaced by compact-check tests (net zero); two pre-scan tagging entry tests and one unsupported-link coverage regression add three. Backend safety tests were not removed.
- `npm run lint` includes both TypeScript projects and the production build: passed. Only the same two reviewed network advisories remain.
- Mutation audit **5/5 killed**, restored controls passed. An initial sandbox run returned no nested Vitest output; its local failed log is retained, not counted as passing.
- Native session **2/2**, runner **3/3**, including failure, timeout and SIGTERM cleanup.
- Public manifest remains **2.3.1**, package/lock **2.4.0**, no 2.4.0 compatibility entry. This is development code, not a release.

Logs: [suite](evidence/a/suite.log), [lint/typecheck/build](evidence/a/lint.log), [mutation](evidence/a/mutation.log), [runner](evidence/a/runner.log).

## Real Obsidian evidence

Obsidian **1.13.7**, Electron **43.6.0**, Native frame, private Xvfb/Openbox, synthetic notes. Screenshots were visually inspected; private screenshots were not exposed to the agent. Receipts in this directory redact host checkout/disposable paths and include the original receipt hash. Original raw receipts, including failures, remain unchanged locally. Regression runs taken during development retain their own asset hashes; the final compact-check and Minimal captures are from runtime commit `225d7572af33e1be808256d2d4d0e52f30b63025`.

- [Before](evidence/a/baseline/) and [after](evidence/a/after/): six corresponding states in light/dark, continuous native recordings. The after run additionally verifies RU/EN, 390px/wide, keyboard search/focus, reduced motion, real split/popout and no horizontal overflow.
- [Minimal](evidence/a/minimal/): installed unmodified theme, commit `6d260b4e0ce60e9563b2d9a268310b88934d0384`, CSS hash in receipt; same RU/EN/light/dark/390px checks.
- Passive Workspace: **0 plugin Markdown reads, 0 plugin writes, 0 HTTP requests**. Host-owned reads are counted separately. All synthetic Markdown remained byte-identical.
- [Smoke](evidence/a/smoke/), [R05.1](evidence/a/local-link/), [R05.2](evidence/a/local-notes/), [R05.3](evidence/a/registry/): real Review/Apply/disk/Undo, exact bytes, conflict/recovery controls retained. A first R05.1 adaptation selected the wrong folder; it now locates the exact option before native key input. A real pre-scan tagging-entry regression was fixed by retaining that action in `…`.
- [Recall](evidence/a/recall/): **45 checks**, including saved generation, editor Undo/Redo, schedules and recovery. [Studio](evidence/a/studio/): **66 checks**; the first attempt still expected Community in navigation and is retained separately.
- [Community](evidence/a/community-test-flag/): **47 checks** with an explicit internal test override and pinned local catalog. On restart, the OFF default initially hid Community in the host-restored leaf; the harness now remounts only that disposable test leaf after enabling the flag. This does **not** resolve the historical document-ownership defect or validate production online availability.
- [Map regression](evidence/a/map-host-failed/): **FAIL**, unfiltered host `TypeError: e.isShown is not a function`; functional checks and byte preservation reached their assertions. No retry or host patch was used to turn this receipt into PASS.

### Bounded performance observations

| Synthetic Markdown | First explicit check | Ready-cache repeat | Finding list | Limit |
|---:|---:|---:|---|---|
| 154 | 324 ms | 336 ms | 176 findings, 60 rows / 414 elements | Single local machine/run; not a universal latency promise |
| 1,000 | 861 ms | 706 ms | 1,143 findings, 60 rows / 447 elements | No semantic computation |
| 5,000 | 4,304 ms | Blocked | Partial initial result | Host cache did not become fully available within existing wait; original FAIL retained |
| 10,000 | Not established | Not established | Not established | Process exited without a final harness receipt; cleanup receipt retained, no PASS claim |

The large runs coincided with limited tmpfs/memory capacity. This does not establish a product cause. No timeout/cap increase, hidden first-500 analysis or semantic-family claim. 10k cold readiness remains open; large-map work belongs to UX-C. Peak process memory/frame timing were not reliably established here.

### Private notes-only walkthrough

Owner-authorized isolated copy only: **154 Markdown / 3 Canvas**; no original-vault launch/access, original configuration, credentials, embeddings or attachments. Detailed files remain in a private local evidence directory, outside this repository. Baseline and the partial-state UX-A walkthrough passed their byte-preservation and zero-network checks. A first private harness incorrectly assumed cache existence implied usable link targets; that failed attempt is retained. Aggregate diagnosis: 32 notes have empty targets, 122 have usable link metadata. The UI keeps the result partial; this is not evidence of a defect in the original vault, especially with attachments omitted. Real semantic quality remains **BLOCKED_NO_REAL_INDEX**.

## Build identity and remaining gates

| Asset | SHA-256 |
|---|---|
| main.js | `5faf499c1a612d6ebf6bde369b3f61435d6bdec6d767731b2bc0c7aea7b8fb73` |
| styles.css | `c0db587e4a7710f11e7b3ca7a94a647442ec0f9cbf0161b1768dfaf5665e906e` |
| manifest.json | `a1c0f8f03004a3d19141ae0bae00f33dcc2a4e6c0e66135d99c0ab419e13a6a1` |

Open independently: host tooltip `e.isShown`, Community document ownership, cold-start 10k, first-modal/pointer/focus, custom-frame `getZoomFactor`, physical GPU/compositor/IME, screen reader and remaining partial-cache native cases. One successful Xvfb run closes none of these gates. Owner UX acceptance, UX-B/UX-C and real semantic quality remain outstanding. No merge, release, version/dependency or journal-format change.
