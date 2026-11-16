# Community Apply confirmation: bounded A/B — 2026-11-16

**PR #147 remains draft; do not merge. No runtime fix is claimed.** The baseline
reproduced the missing-confirmation symptom. In that attempt, the native click
reached the real handler, the write plan completed, and the Modal opened in a
different document from the one queried by the harness. Why that document was
chosen, and whether it was a usable separate window, remain unresolved.

## Pinned comparison

- A: current main after #148, `90815b044b5351588f5cd21fecd3024501b45b6b`.
- B: PR #147, `9ab5e0ca15e234510c82286eaa9db044ec95d30d`.
- The later diagnostic/evidence commit does not change production TypeScript,
  CSS, manifest, package versions, dependencies, security policy or journals.
- Obsidian **1.13.7**, Electron **43.6.0**, Chromium **150.0.7871.250**;
  the existing launcher, private Xvfb/Openbox, Native frame, GPU disabled.
- Same six synthetic notes, catalog fixture commit
  `2c9de8caede80fc91b46f49f18548c7f38b24fd4`, loopback transport and explicit
  model consent. Each cold attempt has its own vault/profile and one real
  process restart, as in the original Community scenario. No desktop or paid call.

[Initial protocol](evidence/community-apply-attribution/protocol.json) was saved
before A1/B1/A2/B2. After A2 revealed the document mismatch, a
[preregistered extension](evidence/community-apply-attribution/protocol-extension.json)
used the final allowed A3/B3 pair to collect owner-window and CDP target details.
There were **three attempts per configuration**, no retries beyond the cap.
All stopped at the first source-write confirmation boundary, before confirming
the write or executing later Community cases. The original sequence, waits,
pointer dispatch and production event handlers were retained.

Production asset SHA-256:

| Asset | A: main | B: #147 |
| --- | --- | --- |
| main.js | `fb0fd503b54f375d24d0bd95af3187d1dc3b635aabb83e8917af1c60d07291e3` | `d62638ffcdb2d0bfb724d0cd11e2f231de8096fca257077f162389541c7a167a` |
| styles.css | `d71204f8c1f63bee141c383047ec10752254285936181b77efbaee9386babc87` | `8bd2ef4e334931500132dd7a61dc56b304b25989cdac2266cc2eaabb4f820be4` |
| manifest.json | `a1c0f8f03004a3d19141ae0bae00f33dcc2a4e6c0e66135d99c0ab419e13a6a1` | same |

The public manifest stays byte-identical to published **2.3.1**; packages remain
**2.4.0 development**, and `versions.json` has no 2.4.0. Neither internal build
is the published stable release. Build identity is the source SHA plus hashes.

## Results

| Attempt | Pointer handler / prepared plan / onOpen | Confirmation in queried main document | Result |
| --- | --- | --- | --- |
| [A1](evidence/community-apply-attribution/native/A1/report.json) | reached / prepared / called | yes | boundary PASS |
| [B1](evidence/community-apply-attribution/native/B1/report.json) | reached / prepared / called | yes | boundary PASS |
| [A2](evidence/community-apply-attribution/native/A2/report.json) | reached / prepared / called | **no; Modal belongs to another document** | **boundary FAIL** |
| [B2](evidence/community-apply-attribution/native/B2/report.json) | reached / prepared / called | yes | boundary PASS |
| [A3](evidence/community-apply-attribution/native/A3/report.json) | reached / prepared / called | yes | boundary PASS |
| [B3](evidence/community-apply-attribution/native/B3/report.json) | reached / prepared / called | yes | boundary PASS |

Observed frequency: A **1/3 failures**, B **0/3**. This small instrumented sample
does not establish a frequency difference or eliminate an intermittent failure.
The five successful boundaries do not replace the previous failed full regression
or establish completion of Apply/Undo. Receipts say `DIAGNOSTIC`; the launcher's
exit code means diagnostics completed, not that every pointer outcome passed.

Every attempt recorded trusted pointerdown/mousedown/pointerup/mouseup/click on
the connected, enabled button, then the actual button listener, `StudioView.run`,
`runner.reviewWrite`, `writeDialog`, the `Modal.open` call site and `onOpen`.
Conditional CDP breakpoints observed existing functions; no function or prototype
was replaced. Read-only snapshots and DOM event listeners/MutationObserver
recorded state, focus, leaf, button identity and rerender transitions. The existing
native harness IO spies and synthetic transports were unchanged.

No Enter control was eligible: the handler received the pointer click in all six
attempts. No second click, forced opening, artificial wait, hidden fallback,
exception suppression or `element.click()` replacement was added.

### What A2 establishes

- The same failure boundary occurs **without R06.1**. Studio view, UI, runner and
  the original Community harness have no source delta between A and B.
- Pointer hit the correct button; the full native event sequence reached its
  actual handler. Lost click delivery does not explain **this observed attempt**.
- `reviewWrite` read the saved source and completed a plan. It was neither rejected
  nor left pending. Afterwards: state `review`, `canApply=true`, operations not busy,
  one selected `Formatting.md`, unchanged review identity, no visible error.
- `runner.reviewWrite` emitted the expected Review rerender before `writeDialog`;
  the button was replaced and focus restored. No leaf change or View teardown
  was observed. The handler had already executed before the rerender.
- The dialog remained `active=true`; `modalEl` and `contentEl` were connected.
  **`contentEl.ownerDocument !== document`**. The main document contained zero
  `.modal-container` elements, so its confirmation selector timed out.
- There were zero uncaught exceptions and zero source writes. The third read is
  the explicit write-plan preflight, not a write.

Thus the immediate timeout is localized to the document/window boundary, after
successful plan preparation and modal creation. This is not enough to decide
between a harness that ignores a legitimate separate window and a host that chose
an inappropriate/stale window. Changing the selector to accept any connected
Modal would hide that distinction and is deliberately not done.

### What remains unknown

A2 did not capture the owner's URL, native window identity, `closed` flag or
visibility. The extended A3/B3 runs did capture live main-document dialogs; both
also listed a separate `about:blank` **Settings** CDP target. There is **no evidence
that A2's dialog belonged to that Settings target**, nor that it was closed,
hidden or visible. These possibilities remain hypotheses. Main-document modal
counts and the Studio-owned dialog set were captured; the host's complete modal
stack and every window's compositor visibility were not.

CDP breakpoint setup and logging affect timing; the protocol did not treat a delay
or successful subsequent attempt as a fix. The previous R05.3 and integration
receipts lack this lifecycle trace, so their similar symptom cannot retrospectively
prove the same owner-document cause. They remain
[byte-preserved](evidence/community-apply-attribution/prior-receipts-preservation.json).

Next minimal experiment, **not run here**: on the first mismatched-document
failure, keep that same session alive and identify the actual Modal's owner
against all CDP page targets and Openbox window identities; collect its closed,
focus and visibility state and an uncropped private-display screenshot. Inspect
the real Modal window-selection call frame if needed. No new large scenario sweep,
repeated clicking, automatic confirmation or changes to Obsidian are justified.

## Preservation and checks

[Summary](evidence/community-apply-attribution/summary.json) records per-attempt
IO, disk hashes, final journal inventory and cleanup. All six originals remain
byte-identical in every attempt. Each Apply boundary adds one observed saved-note
read, zero `Vault.process` calls and zero browser requests. Exactly one explicitly
consented **synthetic local** generation precedes each boundary; catalog traffic
is loopback GET only. This is not live-model quality evidence or an OS-wide network
audit. Final Studio storage has generation start/finish records and catalog/install
data, with no write-operation records. Journal bytes were not snapshotted before
the click, so the final inventory is not a before/after journal hash comparison.

All six process groups exited; all **12 distinct CDP ports** closed. Temporary
Native frame settings apply only to disposable profiles. No personal vault,
Obsidian settings or other existing worktree was changed.

Fresh checks on the unchanged runtime plus diagnostic harness:

| Check | Result |
| --- | --- |
| Studio workflow / Community focused tests | 142 / 3 files PASS |
| Full suite | 5,376 / 209 files PASS; no test-count change |
| Typecheck, production build, lint | PASS; two previously accepted fetch advisories |
| Mutation audit | 5/5 killed, restored tests PASS |
| Native session boundary / Python runner tests | 2 / 3 PASS |
| Native trace evidence checks | 3 PASS, including preservation of A2 as FAIL |

The first sandboxed trace-check invocation reported only one file-level test,
without executing/reporting the three named cases. It is retained and is not
counted as verification. The unchanged command outside that sandbox reported all
three named assertions; see `trace-check-unsandboxed.log`.

[Logs](evidence/community-apply-attribution/checks/) ·
[A2 full failed main client](evidence/community-apply-attribution/native/A2/apply-pointer.png) ·
[B3 full confirmation client](evidence/community-apply-attribution/native/B3/apply-pointer.png) ·
[Evidence hashes](evidence/community-apply-attribution/SHA256.json).

No runtime fix was made, so the full downstream Community regression was not
repeated in this bounded investigation. The previous mandatory Community failure
remains open. Earlier smoke/map/R05/Studio/Recall results in the
[integration report](part1-integration-148.md) are historical, not new runs here.
Exact-head hosted CI is reported in PR #147; CI cannot close this native gate.

## Reproducing the diagnostic

```sh
npm run build
VEYNREL_COMMUNITY_APPLY_TRACE=1 python scripts/native/run.py community /path/to/local-catalog
# Optional A/B asset directory: VEYNREL_NATIVE_BUILD=/path/to/pinned/build
node --test scripts/native/community-apply-trace-check.mjs
```

The opt-in mode stops before final write consent and reports the pointer outcome
separately. The normal Community command retains its original 47-check scenario
and assertions. The trace helper asserts the expected generated source locations;
it fails if instrumentation cannot be installed instead of silently claiming
coverage. No additional launcher or dependency was introduced.

R06.1 remains only the first R06 substage. Existing tooltip/custom-frame,
first-modal, 10k cold-start, large picker and narrow UX gates are unchanged;
semantic families and map-route migration remain deferred. Xvfb does not certify
physical compositor, GPU or IME behavior. No merge, release, tag or R06.2 work.
