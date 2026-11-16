# R06.1 integration after PR #149

PR #147 remains **draft, unmerged, auto-merge off**. The requested integration
checks pass; the existing Community confirmation gate remains open. This report
does not declare R06 complete or authorize publication.

## Source and merge review

- Previous PR HEAD: `3b48b3cd348ea87b0ced2124e7a7fb531f5ee64a`.
- Integrated main / merged #149: `45ff65e040b309b875be318f66fe2f8558b7bdfa`.
- Tested merge/source: `99f7ae128c7b71dab6e76f6112bf0621d40bada4`.
- The final PR HEAD is pinned in its description; the following commit adds only
  this report, its navigation link and evidence.

An ordinary merge completed with **no textual conflicts**. Both parents are
recorded in [merge preservation](evidence/integration-149/merge-preservation.json).
Manual review of `docs/native-testing.md` and
`docs/roadmap/vault-assistant-plan.md` confirmed that #149's policy and R06.1's
commands, boundaries and contract links coexist. No reset, force-push or
whole-side conflict selection was used.

Relative to the previous PR HEAD, the merge brings exactly #149's 11 files:
ten Markdown documents and one test-description change. Production code,
native harnesses, dependencies, journals, version metadata, version-bump guard,
its tests and CI workflows are unchanged. The compatibility test's assertions
are unchanged. All **372 pre-existing R06 evidence files**, including failed
Community receipts and traces, retain their original bytes.

## Release policy and build identity

The [roadmap](../roadmap/vault-assistant-plan.md) and
[Community version policy](../community-version-policy.md) now govern two releases:

- **2.4.0:** after complete, accepted R06 and R07 on top of R01–R05, separate
  release acceptance, and a separate owner authorization to publish. Acceptance
  requires current README and Community listing, real native screenshots and
  demonstration videos, release notes, a reproducible build with exact source
  and asset hashes, migration/backup/recovery and supported Undo, and clean
  installation and upgrade checks in Obsidian. Candidate installation checks do
  not prove actual post-publication Community delivery.
- **2.5.0:** after R08–R15, separate acceptance and owner publication authorization.
- Community write-confirmation/document ownership remains an **open release
  gate**. [Resume Batch](../roadmap/resume-batch.md) remains mandatory before
  public 2.4.0 unless the owner explicitly permits deferral. Neither is implemented
  or waived by this integration. A feature PR or internal candidate does not
  authorize stable, beta, prerelease or Marketplace publication.

After production build, `manifest.json` remains byte-identical to the published
**2.3.1** manifest; `versions.json` has no 2.4.0 entry. `package.json` and both
lock-root versions remain **2.4.0 development**. The displayed Obsidian version
is not the identity of this unpublished development build.

| Asset | SHA-256 |
| --- | --- |
| main.js | `d62638ffcdb2d0bfb724d0cd11e2f231de8096fca257077f162389541c7a167a` |
| styles.css | `8bd2ef4e334931500132dd7a61dc56b304b25989cdac2266cc2eaabb4f820be4` |
| manifest.json | `a1c0f8f03004a3d19141ae0bae00f33dcc2a4e6c0e66135d99c0ab419e13a6a1` |

All three assets are identical to the previous PR build; see
[build receipt](evidence/integration-149/build.json). No active release was changed.

## Fresh automated checks

| Command | Result |
| --- | --- |
| `npm test -- --maxWorkers=2` | 5,376 tests / 209 files PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; zero errors, two existing fetch advisories in unchanged files |
| `npm run build` | Production build PASS; public metadata unchanged |
| `npm run audit:proposals` | 5/5 mutations killed; restored checks PASS |
| `node --test scripts/native/session-check.mjs` | 2 PASS |
| `python scripts/native/test_runner.py` | 3 PASS |
| `node --test scripts/native/community-apply-trace-check.mjs` | 3 PASS; historical A2 remains FAIL |

The test count is unchanged: #149 renames one test description and adds/removes
no cases. [Raw logs](evidence/integration-149/checks/) are new runs on the integrated
source. Trace checks validate preserved diagnostic evidence; they are not a new
Community native regression. Hosted CI for the final HEAD is recorded separately
in PR #147 and must not be inferred from local results.

Markdown/source whitespace and local links pass review. The full staged
`git diff --check` reports only the original trailing blank line in four raw
command logs; those evidence bytes are intentionally preserved.

## Fresh isolated native checks

All five scenarios ran **once**, through the existing `scripts/native/run.py`, with
separate disposable vaults/profiles, private Xvfb/Openbox and Native frame. Runtime:
Obsidian **1.13.7**, Electron **43.6.0**, Chromium **150.0.7871.250**, GPU disabled.
No desktop flag, personal vault/settings change, paid request or live-model call.

| Command | Checks | Result / unhandled exceptions |
| --- | --- | --- |
| `python scripts/native/run.py smoke` | 21 | PASS / 0 |
| `python scripts/native/run.py map 120` | 23 | PASS / 0 |
| `R06_INDEX_COUNT=60 python scripts/native/run.py map 120` | 23 | PASS / 0 |
| `R06_INDEX_COUNT=0 python scripts/native/run.py map 120` | 21 | PASS / 0 |
| `python scripts/native/run.py map 1000` | 12 | PASS / 0 |

The map receipts retain exact-coordinate assertions for link/tag overlays and
topology refresh; shared map/list exclusion policy; camera, selection, query and
filter context through Pair Inspector/Back; missing/partial index states; and the
unchanged 500 eligible-document cap. The 1,000-note run refuses semantic analysis
with `too-large` and represents every path in **10 technical display groups**.
Those groups are not semantic families. No ranking or cosine change was made.

Every map run records zero Markdown reads/writes/network requests on passive
opening and explicit map refresh. Later explicit Inspector/source viewing causes
132 reads in each indexed 120-note run and 12 in the no-index run; the 1,000-note
run remains at zero. Writes and observed network requests stay zero throughout.
These are the harness counters and browser request receipts, not an OS-wide
network audit. All five runs assert **byte-identical original Markdown**.

Smoke verifies RU/EN, both native themes, keyboard Tab/Enter/Escape, actual native
resize and zoom, real split/popout and focus return, passive unscanned Workspace
and an explicit local check. The 120-note runs also check RU/EN and both themes
at 390px without horizontal overflow. New screenshots were inspected; this does
not close the previously incomplete narrow-screen UX acceptance.

All **five process groups** exited and all **five distinct CDP ports** closed.
The complete new raw sessions were moved to a separate local research archive
only after cleanup, to keep the initially 227 MB `/tmp` capacity available.
No old session/evidence/worktree was deleted. Public evidence contains synthetic
receipts, full client screenshots and recordings, not profiles, keys or private
notes. Commands, environment, ports and cleanup are in the
[run summary](evidence/integration-149/native-summary.json).

[Native receipts](evidence/integration-149/native/) ·
[EN map](evidence/integration-149/native/map120/loaded.png) ·
[RU dark 390px](evidence/integration-149/native/map120/map-ru-dark-390.png) ·
[Pair Inspector](evidence/integration-149/native/map120/pair-inspector.png) ·
[continuous map recording](evidence/integration-149/native/map120/journey.mp4) ·
[evidence hashes](evidence/integration-149/SHA256.json).

## Preserved Community diagnosis and acceptance limits

The [bounded Community A/B report](community-apply-attribution.md) is unchanged:
the earlier main failed **1/3** attempts; the earlier PR build failed **0/3**.
In the failed attempt, the click reached its handler, `runner.reviewWrite`
prepared the plan, and `Modal.open` / `onOpen` executed, but the Modal was connected
to a different document. **Why that document was chosen remains unknown.**
That small sample neither establishes a frequency difference nor fixes the
failure. No delay, retry, hidden fallback, exception filter or monkey patch was
added. The failed mandatory full Community regression remains an open gate.

R05.1–R05.3, Studio, Recall and full Community native scenarios were not repeated:
this integration changes documentation and a test title only, their production
and harness bytes are unchanged, the full automated suite passed, and the requested
new smoke/map runs cover the integration surface. Their earlier results in the
[post-#148 report](part1-integration-148.md) remain historical, including Community
FAIL. No new large 5k/10k experiment or Community investigation was performed.

Still open: historical `e.isShown` tooltip exception; 10k cold-start gate; the
second-note selector with over 10k DOM elements; complete narrow-screen UX
acceptance; semantic families/overlapping membership and competing-map route
migration. First-modal, first-pointer and Obsidian custom/hidden-frame limitations
are unchanged. Native frame is a tested host workaround, not an Obsidian fix.
Xvfb does not certify GPU, physical compositor, IME or desktop behavior, and
synthetic vectors do not establish embedding quality or user benefit.

**Recommendation:** the limited R06.1 integration is ready for owner review, but
not for unconditional acceptance/merge while the Community gate lacks an explicit
owner disposition. R06.1 is only the first R06 substage. Keep the PR draft; do not
merge, publish, or begin R06.2/R07 in this task.
