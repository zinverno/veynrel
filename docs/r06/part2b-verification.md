# R06.2b — unified Workbench integration candidate

Base: `2d261dafaca539366dfc2e2ecc2e9fff8a9f90d3` (merged #150).
The [audit](part2b-audit.md) precedes implementation. Exact runtime commits and
SHA-256 identities are in [build identity](evidence/part2b/build-identity.json),
individual receipts and `runtime-context.json` sidecars. This is a draft integration
candidate, **not completion or final UX acceptance of R06**.

## Parity and migration

| Previous surface | Workbench destination | Preserved data and behavior | Boundary |
|---|---|---|---|
| Topology graph | Structural inspector under the existing canvas | Same shared topology snapshot, directed in/out links, reciprocal links on the canvas, component sizes, bounded component-member search, articulation connectors, unresolved targets/occurrences, complete/partial and unknown facts, exact paths | Counts/components are whole-vault facts even when the canvas has a folder scope; shared refresh has no view-local cancel |
| Global Semantic Map | Whole-index similarity inspector | Same validated global projection, core/connectedness, bounded search, top-K, explicit all-document focus scores and reset | Separate unscoped controller session on the same engine; no participation filter or scoped top-K substituted for global cosine scores; cap 500 unchanged |
| Semantic Neighborhood | Selected-source evidence inspector | Same catalog, neighbors, scores, headings, stored previews and source line ranges; explicit explore/refresh/choose another | Whole existing index, not just canvas scope; opening the inspector does not compute |
| Connection Opportunities | Global comparison inspector | Same candidate/aligned/explicit-only categories, directions, ranks, shared neighbors, coverage, filters, session annotations, opening both notes | Legacy global comparison does not apply scoped participation rules. Its annotations are explicitly distinguished from durable Pair Decisions |
| Scoped candidate list and Pair Inspector | Existing Review list and map → pair → Back | Same scoped participation rules, exact pair identity, source verification, consent, R05 local plans, History/Undo; same persisted decisions owner and restore | Review remains an independent list-only workflow. Map conservatively withholds path-matched saved decisions pending source verification in Review |
| Workspace Home exploration | Existing Workbench | Home opens the canvas; families focus the same coordinates; note details and inspectors are secondary document-flow content | No new top-level Workspace, renderer, index or decision store |

`topology`, `semantic-map`, `semantic-neighborhood` and `connection-opportunities`
are redirected only when the Workbench and necessary session capabilities exist.
The original global-scope one-use acknowledgement remains before redirection.
Legacy renderers remain available for hosts/adapters without those capabilities;
they are not a second normal production navigation surface. Existing command IDs,
search dialogs, Review list and built-in Obsidian Graph View are unchanged.

The embedded modes reuse the original inspectors. Global focus no longer says it
moves the canvas: it displays comparisons with all eligible indexed documents.
Computed coverage is distinct from displayed nodes and refused eligible counts.
No physics, embeddings, top-K ranking, cosine, family heuristic, display-group
algorithm or semantic cap change.

## Ownership, freshness and decisions

- Each graphical Workbench receives independent scoped semantic/comparison and
  unscoped global/neighborhood sessions. Sessions share the existing engine/index,
  not mutable view state. Construction and subscription alone perform no scan.
- Cancel invalidates the view epoch, aborts its supported asynchronous semantic/
  duplicate work and discards late publication. It never disposes or cancels the
  plugin-owned topology controller. Closing/suspending a view cancels its work;
  another window can retain the same topology and its own semantic result.
- All-document focus and neighborhood engine calls are synchronous internally.
  Cancellation can prevent/ignore publication but cannot preempt a call already
  executing on the JavaScript thread. No stronger claim is made.
- Index revisions, selection-rule revisions and topology freshness stay with their
  existing owners. Stale data can remain visible with existing stale warnings;
  it cannot authorize a new R05 operation.
- Map opens/selection do not read saved Markdown merely to check decisions.
  A saved path match is withheld from new map candidates, without asserting that
  its source hash is unchanged. The existing Review list verifies saved-source
  fingerprints and can restore a decision. Thus a source-changed pair may be
  actionable in Review before being offered again on the map: conservative
  decision-freshness parity remains a final UX boundary, not a second decision store.
- Choosing a pair or family grants no AI consent or write ticket. Pair Inspector
  owns reading saved sources; R05 owns plans, confirmations, Apply and Undo.

## Local validation

Full suite: **5,415 PASS / 211 files**, versus 5,402 on the base. Thirteen new cases:
three global-session/cancellation tests, one neighborhood session test, two
Workbench ownership tests, two RU/EN topology parity cases, two RU/EN focus UI
cases, two RU/EN refused-cap coverage cases and one AST construction-boundary test.

[Checks](evidence/part2b/checks/) contain full output. Typecheck and production build
pass. Lint retains only the two previously reviewed fetch advisories. The initial
owner-boundary failure and initial lint failures are preserved; the boundary now
allows exactly the explicit same-engine Neighborhood session factory, while still
forbidding construction in views/actions. No network/mutation boundary is relaxed.

Session checks pass. Native runner tests: 3 PASS (failure, timeout, SIGTERM cleanup).
Mutation audit: 5/5 killed and restored tests pass. The first sandbox invocation
returned no child-test output; an unmodified local host invocation passed. Both logs
are retained. GitHub CI is checked separately against the final PR HEAD.

## Native evidence and limits

All runs: real Obsidian 1.13.7 / Electron 43.6.0 / Chromium 150.0.7871.250,
Xvfb/Openbox, Native frame, disabled GPU, separate synthetic vault/profile and
`DevToolsActivePort`. No working-desktop windows or paid calls.

The [native index](evidence/part2b/native-summary.json) lists **every** attempt,
including failures; [cleanup](evidence/part2b/cleanup.json) records process groups
and CDP closure. Original reports and old R06 evidence are not rewritten.

- [Before](evidence/part2b/before/report.json): frozen assets from the exact base
  source tree, PASS. The #150 worktree is untouched.
- [Unified journey](evidence/part2b/native/unified/report.json): **40 functional
  assertions passed; overall FAIL** due to one unfiltered host `e.isShown`.
  Confirms old/new focus-score and neighborhood-fragment equality, global comparison
  pair equality, one canvas, exact unresolved target, folder/global handoff, same
  persisted Review Decision and restore, Pair Back context, two independent owners
  in real split/popout, RU/EN, light/dark, 390px and zero Markdown mutation/network.
  [Continuous video](evidence/part2b/native/unified/journey.mp4).
- First development run: 31 assertions, then host `e.isShown`. Second: 38 assertions,
  then our Escape focus defect, with zero host exceptions. The SVG was looked up by
  `data-camera` before its first paint. The fix selects its existing DOM identity,
  without delay/retry. The subsequent receipt confirms exact SVG focus.
- [Final labels/context](evidence/part2b/native/labels-final/report.json): **19
  assertions passed; overall FAIL** due to host `e.isShown`. Confirms accurate
  all-document labels, actual computed counts, RU/EN light/dark, 390px header clear
  of sticky navigation, family → canvas focus, visible note context and close →
  canvas. [Video](evidence/part2b/native/labels-final/journey.mp4).
- [Smoke](evidence/part2b/native/smoke/report.json): 21 PASS;
  [ready120](evidence/part2b/native/ready120/report.json): 23 PASS;
  [partial120](evidence/part2b/native/partial120/report.json): 23 PASS;
  [absent120](evidence/part2b/native/absent120/report.json): 21 PASS.
  These successful scenarios have zero unhandled exceptions and retain Markdown.
- R05.1 local actions: **23 PASS**; R05.2 local notes: **67 PASS**;
  R05.3 registry/decisions: **32 PASS**; full Studio: **66 PASS**;
  Recall: **45 PASS**. Each successful receipt has zero unhandled exceptions.
  Synthetic loopback responses test UI/write contracts, never semantic model quality.
- [Community](evidence/part2b/native/community/report.json): **10 assertions, FAIL**
  waiting for the separate write confirmation in the current document. Three reads
  of the explicitly selected synthetic source, zero writes, zero unhandled
  exceptions. All six Markdown files remain byte-identical. This is consistent
  with the historical symptom, but this run does not diagnose document ownership
  or establish its cause. No retry, timeout increase or host patch was applied.
  Community remains an open release gate.

All 20 attempts retain their original reports. All 27 dynamically allocated CDP
ports were distinct and closed, and all owned process groups were cleaned. A batch
orchestration process ended after Recall had already completed successfully; its
original successful receipt was collected without rerunning Recall. Community ran
once separately. No active personal session was used or terminated.

Full-client screenshots are preserved, including failure frames. Examples:
[before map](evidence/part2b/before/loaded.png),
[after map](evidence/part2b/native/unified/loaded.png),
[structural inspector](evidence/part2b/native/unified/unified-structural.png),
[real popout](evidence/part2b/native/unified/unified-popout.png),
[RU narrow focus](evidence/part2b/native/labels-final/focus-ru-light-390.png).

Opening the map and explicit read-only map/inspector computation recorded zero
Markdown reads/writes and network requests. Pair Inspector subsequently read saved
sources under its existing explicit contract. Per-stage IO is in the receipts;
settings/decision saves are not claimed to be Markdown writes. Map byte-preservation
sidecars additionally verify saved fixtures where an earlier failure prevented the
harness's final byte assertion.

## Scale observations

[Benchmark](evidence/part2b/benchmark.json) records raw times and coverage. These are
single synthetic runs, not statistical latency guarantees or real embedding quality.

| Scope | Native result | Host metadata wait | Semantic work | Display / picker |
|---|---|---|---|---|
| 1,000 | PASS, 14 assertions | 6.93 s | Refused at unchanged 500 cap; 0 documents computed | 10 technical groups; picker 20 results / 71 elements; search 5.19 ms |
| 5,000 | 14 assertions; FAIL due to `e.isShown` | 46.50 s | Refused at cap; 0 computed | 50 technical groups; picker 20 / 71 elements; search 24.27 ms |
| 10,000 cold | FAIL readiness, 2 assertions | 90 s boundary; 8,486 caches available | Not reached | Initial passive surface only; no claim of complete analysis |
| 10,000 warm picker control | PASS, 7 assertions | 16.16 s before opening UI | Deliberately not requested | Full-path inventory search, 20 / 68 elements; 2.47 ms |

1k/5k fallback layout: 9.7/26.6 ms; display grouping 1.2/4.9 ms; no physics ticks.
Global computation durations at the cap are refusal/eligibility costs (122.8/1098.8
ms), **not** a similarity computation over 1k/5k. 10k warm initial fallback layout
44.3 ms, grouping 10 ms. Heap values are sampled renderer heap, **not peak process
memory**. Frame-interval samples include 16.7 and 33.3 ms; Xvfb says nothing about a
physical GPU/compositor. Technical path groups are never called semantic families.

Cold versus warm separates opening the UI during metadata loading from waiting
before opening it. It does not establish whether host loading, UI event pressure or
the harness is the sole cause. No timeout was increased and no cold failure was
relabelled warm success. Further cold-start diagnosis is a separate bounded task.

## Acceptance and remaining gates

Read-only data/route parity is demonstrated for the exercised fixtures, including
true all-document focus from a folder-scoped Workbench. The independent list-only
Review workflow and its source verification remain intentionally available.

**Not ready to declare R06 finished.** Next: owner UX acceptance of the unified
route and the conservative decision-verification handoff; bounded cold-10k/host
focus-tooltip diagnosis; real-desktop acceptance for GPU/compositor/IME. A partial
metadata inspector is covered by contract/UI fixtures; no claim of a full native
partial-cache inspector journey is made. Historical initial-focus/first-pointer,
first-modal, custom-frame `getZoomFactor`, `e.isShown` and Community different-document
confirmation gates remain open. A successful isolated regression does not close them.

Public manifest remains byte-identical 2.3.1; package/lock remain development 2.4.0;
`versions.json`, version-bump guards, release policy and mandatory Resume Batch are
unchanged. No release, merge, installation in a personal vault or R07 work.
