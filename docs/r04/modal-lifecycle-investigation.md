# R04 first-modal investigation — 2026-11-15

**The original native gate remains OPEN. No runtime fix is claimed.**
The bounded controls below show working first and repeat openings, but did not
reproduce the original combination of a delivered click, a retained modal instance
and absent `.ai-taxonomy`. Neither waiting for command completion nor a successful
repeat establishes the cause of that earlier failure.

Base/main: `abef6366cc83611382baa36c688da109e573c178`.
Investigated R04 HEAD: `80936ddb15c46cea3ac5a32db8b7b31e93b5c859`.
The follow-up changes only diagnostics and evidence in PR #143. Runtime, versions,
dependencies, settings formats and the existing 44-scenario harness are unchanged.

## Original evidence and the missing distinction

| Receipt | What it actually establishes |
| --- | --- |
| [attempt2](evidence/development-attempts/attempt2/report.json) | First-modal DOM readiness failed; insufficient lifecycle instrumentation to attribute it. |
| [delivery](evidence/development-attempts/delivery/report.json) | Enter/key events and click reached the Organization Audit button; the plugin retained one modal instance; `.ai-taxonomy` was absent. No uncaught exception was recorded. This version did not collect console errors or `open`/`onOpen` transitions. |
| [delivery2](evidence/development-attempts/delivery2/report.json) | The final runtime passed 44 assertions after a one-second startup settle. This is historical success, not a demonstrated fix. |

All **103 existing R04 evidence files** were compared byte-for-byte with the
investigated HEAD and remain unchanged, including their SHA-256 manifest.
[Preservation receipt](evidence/modal-lifecycle/preservation.json).

The production factory constructs `TagTaxonomyModal`, adds it to the owner set,
then calls `open()` synchronously. `onOpen()` adds `.ai-taxonomy` before rendering;
`onClose()` releases the instance. Thus a failure *before* the button handler is
different from the original retained-instance failure. A focus-only explanation
does not account for that receipt.

## Instrumentation and its limits

The short [diagnostic harness](../../scripts/r04-modal-lifecycle-native.mjs) uses
the existing `scripts/native/run.py` launcher and `session.mjs`. It runs the real
Obsidian/Electron in a fresh synthetic vault on private Xvfb/Openbox, with Native
frame, a kernel-assigned CDP port, blocked external HTTP and an empty-key loopback
provider that records any attempted request. No personal profile is read or changed.

CDP closure inspection locates the actual loaded modal class and host modal stack.
Source-location logpoints record the factory, `Modal.open`, `onOpen`, rendering,
`close` and `onClose`, and Workspace `onOpen`/render/teardown. The instance is
observed at entry to `Modal.open`, after construction and owner registration;
the final harness deliberately does not break inside the constructor. DOM
observation and keyboard events record insertion/removal and focus changes.
Snapshots include connection flags, owner documents, the real Obsidian modal
stack, current keyboard scope and active Workspace leaf. No host method or
prototype is replaced, no modal is automatically reopened, and no exception is
filtered out of `Runtime.exceptionThrown` or console-error receipts.

The controls await the **actual Promise returned by the registered Workspace
command**, rather than treating the first visible button as command completion.
Before Escape they await any *actual* container animations, not a sleep. They
send exactly one Enter to open, one Escape to close, then a separately labelled
repeat-open control. There is no startup settle timer or input retry. Observation
polling has a ten-second failure deadline and cannot trigger an opening.

Instrumentation changes timing. Initial experiments paused on all exceptions,
including handled host filesystem errors. Those runs frequently failed to deliver
Enter/Escape to DOM listeners and are **not** reliable unperturbed input controls.
The final matrix uses non-pausing source logpoints; uncaught exceptions and console
errors are still collected without filtering. Handled exceptions in the final
matrix are **not exhaustively observed**. All-exception diagnostics remain opt-in
with `VEYNREL_MODAL_PAUSE_EXCEPTIONS=1` and must not be used to claim input fidelity.

## Controlled comparison

Identical host: Obsidian **1.13.7**, Electron **43.6.0**, Chromium
**150.0.7871.250**, Linux/X11, Xvfb **21.1.24**, Openbox **3.6.1**, Native frame,
GPU disabled, 1100 × 900 client area, built-in dark theme, one synthetic Markdown
note. The pre-R04 production bundle was built from tracked files at the exact
base SHA in a separate `/tmp` directory. Its settings fixture has onboarding
completed so the existing Tools → Tag Taxonomy entry is accessible.

| Runtime / entry | EN | RU | First / repeat behavior |
| --- | --- | --- | --- |
| Base, Tools → Tag Taxonomy | PASS | PASS | Both opened once and closed with Escape. |
| R04, Workspace Home → Organization Audit | PASS | PASS | Both opened once and closed with Escape. |
| R04, initial onboarding → Organization Audit | PASS | PASS | Both opened once and closed with Escape. |

[Control receipts and lifecycle counts](evidence/modal-lifecycle/controls.json) ·
[full-size screenshots and raw reports](evidence/modal-lifecycle/controls).

Each of the six profiles records exactly two factory/open/onOpen/render/close/
onClose entry-return pairs. Both modal elements were connected to the main owner
document; the host stack included the actual TagTaxonomyModal. No Workspace
teardown occurred during the two openings. Escape removed the DOM and released
the owner-set instance. Settings hashes were unchanged; synthetic Markdown was
byte-identical; passive note reads, writes/creates, metadata lookups and model
requests were zero. Workspace's existing path enumeration remains visible.
There were **zero uncaught exceptions and zero console errors** in these six
controls. Every CDP listener closed and every owned process group was cleaned up.

Observed frequency in this matrix: **0/6 failed first openings, 0/6 failed repeat
openings**. This is not an estimate of a rare race's frequency: diagnostic setup
and command-readiness waiting differ from the original failed harness timing.

## Diagnostic attempts, not silently discarded

[Attempt index](evidence/modal-lifecycle/attempts.json) and
[raw diagnostic receipts](evidence/modal-lifecycle/diagnostic-attempts) retain
setup failures, unsuccessful input, exceptions and an earlier successful checkpoint.
There were 21 launcher invocations in total: one failed before Obsidian started,
14 diagnostic/setup or checkpoint profiles, and the six final control profiles.
Each was a short open/close probe; the 44-scenario audit suite was not repeated.

| Attempts | Finding / limitation |
| --- | --- |
| `probe1` | Sandbox could not bind Xvfb sockets; no Obsidian run. The repetitive raw log is losslessly gzipped with its original hash. |
| `probe2` | Pausing during host startup produced CDP `Promise was collected`; initialization did not complete. |
| `base-en`, `base-en2` | Harness-development errors: incorrect tool selectors; the first also had an incorrect keyboard-scope shape assumption. No valid first-modal comparison. Original diagnostic exceptions are retained. |
| `onboard-x11` | `xdotool` was absent; no key was sent and no package was installed. |
| `probe3`, `onboard-xtest` | A Workspace rerender moved focus from the onboarding button to its heading before the handler ran. The `!normal` focus branch in `VeynrelHealthView.render` explains this trace. These instrumented runs have zero modal instances and do not reproduce the original signature. This focus branch also exists in the base. |
| `base-en3`, `workspace-ru` | Enter was not observed at the button while all-exception debugging was enabled; no factory/Modal invocation. |
| `probe4`, `location-en`, `base-xtest` | First opening and render completed; Escape was not observed/handled successfully under the pausing debugger. Both pre-R04 and R04 are represented. This is a different failure from absent modal DOM. |
| `probe5` | First opening and Escape succeeded, but repeat Enter did not reach the handler under the pausing debugger. |
| `ready-en` | A function-call breakpoint on the derived constructor coincided with `ReferenceError: Super constructor may only be called once`. It is absent from the original receipts. That diagnostic technique was removed; the exception is retained, not attributed to production R04. |
| `checkpoint-onboarding-en` | Successful non-pausing checkpoint before mechanical harness cleanup; retained separately from the final six profiles with one identical harness hash. |

Caught-error traces include Obsidian filesystem `ENOENT` checks for absent fresh
Health files and `ENOTDIR` directory probes for its configuration files. None
establishes the cause of the original retained-instance/no-DOM receipt. No
`getZoomFactor` exception occurred in the final controls; this investigation does
not change the previously documented custom-frame host limitation.

## Checks and disposition

| New check | Result |
| --- | --- |
| Targeted Workspace/taxonomy tests | 187 passed in 4 files. |
| Full suite, `--maxWorkers=2` | 5,204 passed in 198 files; unchanged count. |
| Typecheck / production build / lint | Passed; two existing fetch advisories. The first lint run rejected executable extensions on archived harness copies; they are now byte-identical `.mjs.txt` evidence. The failed log is retained. |
| Proposal mutation audit | 5/5 killed; restored tests passed. |
| Native launch guards / process lifecycle | 2 / 3 passed. |

[New check logs](evidence/modal-lifecycle/checks) ·
[new evidence SHA-256 manifest](evidence/modal-lifecycle/SHA256SUMS).
The rebuilt R04 `main.js` remains
`a5be23390eb25d9bdcf8c8223737af55aba8315d17c79f16294084485f2bf360`,
identical to the original delivery and every R04 control. The exact pushed HEAD's
CI run is recorded separately in PR #143.

**Unresolved:** whether the original `open()` failed before `onOpen`, returned
without insertion, or its DOM was removed outside the observed lifecycle. Its
receipt cannot distinguish these possibilities. A deterministic R04-only modal
defect, a host defect and a harness timing defect have not been established.
There is no runtime patch, delay workaround, automatic retry or closed-gate claim.

The next minimal experiment, if separately requested, is a small fixed number of
the *original early-input* cold starts with console errors and passive DOM/focus
receipts, without constructor/function-call breakpoints or pauses on handled
startup exceptions. Record command completion without waiting for it; capture
the first retained-instance/no-DOM state before another input. That would test
the original timing rather than treating these later-readiness controls as a fix.

No further experiments are run in this task. The real desktop, light theme,
GPU/compositor, IME, split/popout and full audit workflow were not revalidated in
this focused investigation. No paid calls, personal-vault changes, merge, release,
tag, deployment or R05 work occurred. Auto-merge stays off; PR #143 stays draft.

## Reproduction commands

```bash
# Current R04, first onboarding screen; no visible desktop window:
python scripts/native/run.py organization-open

# Completed-onboarding Workspace, Russian:
VEYNREL_MODAL_MODE=workspace VEYNREL_MODAL_LANGUAGE=ru \
  python scripts/native/run.py organization-open

# Pre-R04 production artifacts from the pinned base, same launcher:
VEYNREL_MODAL_MODE=taxonomy \
  python scripts/native/run.py organization-open /tmp/veynrel-modal-base-abef6366
```

`taxonomy` selects the existing Tools entry; the supplied artifact directory must
actually contain the pre-R04 build. Each receipt hashes its real assets. Never
pass `--desktop` or reuse a personal vault/profile. The optional all-exception
mode is for diagnosis only and may invalidate the keyboard sequence.
