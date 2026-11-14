# R03: Workspace and Studio UX audit

Development only. Public stable remains **2.3.1**; **2.4.0** is unpublished.
The single public release remains gated on acceptance of R01–R15.

## Baseline and method

Baseline: `02be9894ccc7dfcc1e3332d7a3f3630d4488b35c`, including R01 and R02.
Inspection covered the Workspace shell/home, onboarding, Health, findings, Studio
library/preparation/consent/Review, Community, their callers, styles and tests.
Native baseline: Obsidian 1.13.7, Electron 43.6.0, Linux; new disposable profiles,
no credentials. Studio responses come from a loopback synthetic HTTP fixture
through the production transport. This is UI/contract evidence, not model quality.

Full-window baseline captures and uncut native viewport recordings precede product
edits. The small fixture has six notes, a broken link, exact duplicate and short
note; folder `Study` includes three notes and excludes `Study-old`. Empty and
1,000-note fixtures use separate profiles. The latter copies only Markdown from
the existing synthetic lab and verifies the original corpus hashes.

## Observed problems and bounded changes

| Observed problem | User consequence | R03 change | Verification |
| --- | --- | --- | --- |
| Home gives most space to folder geometry; primary button opens notes, local check is below it | The first useful local action is hard to find, especially in a narrow pane | Put scope, recorded check and local-check entry first; keep folder navigation as a disclosure | Same data, full wide/390px captures; explicit scan counters |
| Home says freshness/coverage are not established even immediately after a committed scan | Cannot distinguish no check from a recorded result | Show the existing scan receipt/status and its timestamp; distinguish recorded coverage from present freshness | Empty, complete, partial and stale receipts; no new health calculation |
| Onboarding starts with five profile choices | A local check appears to require a methodology | Offer explicit local check with the existing Mixed default; profiles remain optional | No-key native flow; failed preference-save test; no passive scan |
| Selecting a finding with a folder chosen reopens the scope gate; leaving and returning loses the selected finding | Reading evidence interrupts the journey; context is lost | Retain the acknowledged read context within the same inbox and session navigation state; keep tool/scope-change confirmation guards | Actual finding/evidence, filters, back, focus and scroll; stale/double confirmation tests |
| Studio preparation begins with a long lifecycle warning and always-expanded optional instructions | Note selection and preparation compete with nonessential detail | Short saved-note guidance; optional settings/instructions in disclosures; preserve existing per-recipe drafts | Back/rerender, note count, unsaved-note rejection and keyboard native checks |
| Review exposes an active “Create notes: 0” action and places original/raw disclosures before the result destination | An action can only fail; the result is less prominent than diagnostics | Explain empty selection and disable writing until a row is chosen; show final output/destination before comparison details | No-row/selected-row controls, exact write confirmation, conflict/incomplete regression |
| Changing language leaves the existing Studio header and navigation in the previous language | A single view mixes RU and EN until reopened | Refresh the existing header/navigation captions during render without clearing drafts | Native language switch in the same view; both standard themes and widths |

## Boundaries

Workspace and Studio remain separate ItemViews. Existing routes, commands,
Community and user recipes, finding lifecycle actions and evidence remain.
There is no new scan algorithm, folder-scoped Health scan, recommendation,
persistent UI-state database, provider, prompt system, write permission or format.
Consent, freshness checks, completion validation, journals and supported Undo are
unchanged. Navigation memory is session-only; it does not authorize a future
operation. Changing scope invalidates the acknowledged context.

Detailed validation and evidence are recorded in the [R03 verification report](../r03-ux-verification.md).
