# Stage 3 — integrated beta acceptance

This is acceptance of the existing product, not another feature or visual pass.
No runtime, CSS, ranking, analyzer, writer, ticket, journal, FSRS, dependency or
version change was necessary. New code is limited to the existing synthetic
native harness and installation assertions. Earlier visual A/B is not approved
by this report; list-first remains the primary route.

## Integrated source

- Main checked: `58456e09b735c37472cf194c2086f7f01f260ff3`.
- Stack tip: `7a8492d4743f67aef583fe6964796ea58f4886d6` (#114).
- Frozen product source: `48edb0b51c469a6efbd3a36f11136144df29f9f3`.
- Branch: `integration/veynrel-beta-acceptance`, separate worktree.
- The final review HEAD adds acceptance scripts, documentation and synthetic
  evidence only. Exact review SHA, CI merge-ref tree and three-file comparison
  are recorded in the PR and permanent frozen kit's `REPORT.md`/`CI_BUILD_MATCH.json`.

Every listed PR head is an ancestor of #114; no cherry-picks were needed.
Main had three additional history commits (#104/#105 merge ancestry and the
Acceptance Lab commit). A normal local merge brought in only Lab scripts/docs,
without conflicts. Main is now an ancestor of the integration branch. Source
and product assets retain the Stage 2 runtime; there is no duplicate integration.

| PR | Base | Head | Representation |
|---|---|---|---|
| #106 | main | `282d6fef73a490aaab4e7bcd7cf56c4c9a795636` | ancestor: native shell/Stage 1.1 |
| #107 | #106 | `508c6ab32b08c2ade584b34ac4d804f08cdf4d93` | ancestor: workbench and safe review |
| #108 | #107 | `7163f39e10ec900011090124b767a46e872f4d7f` | ancestor: secondary map experiment |
| #109 | #108 | `627c753c677a33da4980a67c8267b9560efccfd3` | ancestor: standalone list |
| #110 | #109 | `4841de51203403309458c301e436530a2c102c78` | ancestor: output budget/finish checks |
| #111 | #110 | `f246cecf22afdad883023f8dcffb7541ae46dfc6` | ancestor: recommendation to planner |
| #112 | #111 | `eb998837064521a71ac3354822d59d5d21c00c1d` | ancestor: snapshot evidence binding |
| #113 | #112 | `59cb86e3678717977e88e167110d5376cc4a0df2` | ancestor: preflight, facts, decisions, accepted UI |
| #114 | #113 | `7a8492d4743f67aef583fe6964796ea58f4886d6` | ancestor: explicit pre-top-K rules |

All #106–114 remained open with auto-merge off; none was merged, retargeted or
closed. Old worktrees/branches, including the older local #106 checkout, were
preserved. The initial root had untracked task bundles; they were not staged.

## CI discrepancy

The historical #114 workflow/run `39814251890` and job/check `119948432976`
now consistently report completed/success for
`7a8492d4743f67aef583fe6964796ea58f4886d6`. All verify steps and both npm scanner
checks completed. REST jobs, check-runs and PR rollup agree. No retry, empty
commit, status mutation or check disabling was used. The underlying reason for
GitHub's earlier delayed aggregate status is not observable from these APIs;
the earlier inconsistent response is not evidence of a product/test failure.

The repository reported main unprotected, no active rulesets, and protection
endpoint 404 “Branch not protected”. Regardless, this acceptance requires all
three existing workflow jobs completed on the final review SHA. The workflow
checks the PR merge ref: its tree must equal the submitted HEAD tree because
the recorded main is already included. CI artifacts must byte-match all three
frozen/native files. No GO is inferred from only a successful run aggregate.

## Acceptance matrix

All new native runs use Obsidian 1.13.7 / Electron 43.6.0 on Linux, new synthetic
vaults/profiles, artificial persisted vectors and a loopback HTTP fixture.
Existing builders, requestUrl transport parser, evidence adapter, strict
validator, preflight, planners, writers and Undo execute normally.
No personal vault/TEST was read, no user credential was used, and there were
zero live/provider/embedding calls: **cost $0**. Scripted responses establish
integration, not model quality. Each accepted/rejected HTTP request matches its
consent preview byte-for-byte.

| Area | Result | Evidence / boundary |
|---|---|---|
| List-first + passive opening | PASS | direct command creates one list; map construction is trapped; zero opening Markdown/network/write IO |
| Rules before top-5; sixth explanation | PASS | real scoped source: 15 exercise pairs/0 cross pairs → 0/30; no artificial score/rank change |
| Duplicates under rules | PASS | exercise duplicate remains in Repeats |
| Leave as is + refresh + section + restart | PASS | exact saved version excluded in both queues; restore remains explicit |
| Rules and decisions together | PASS | saved under #114, upgraded, restarted; disabling rule retains decision; restoration does not bypass full exclusion |
| Reversed A/B, same basenames, content invalidation | PASS | native decision route and strict identity regressions; identical-text rewrite stays suppressed |
| Exact tag/folder, unknown/stale metadata | PASS | regression tests cover slash boundaries, multiple tags, missing/replaced folders and unverified membership |
| Policy/scope/index changes and late results | PASS | existing controller regressions; source epoch/dispose guards retained |
| Consent, snapshot binding and outputLimit | PASS | actual parser; length, unknown claim ID, wrong schema and action mismatch cannot authorize planning |
| Recommendation → parameters → exact review | PASS | primary card routes directly; no second request; confirmations remain unchecked |
| Unsupported Embed and alternatives | PASS | early disabled primary with reason; independently checked alternate intentions |
| Link Apply → list → reopen → history → Undo | PASS | real Vault.process; all original Markdown hashes restored by Undo |
| Merge → Archive → Archive Undo → Parent Undo | PASS | separate reviews, secondary unchanged before Archive; active archive blocks parent Undo; all hashes restored |
| Link/Embed, Merge/Group/Bundle, atomization, recovery | PASS | unchanged full safety suite and mutation audit; native representative Merge/Archive chain |
| Two views/split/popout | PASS | separate pair authority, common facts/rules owner; edits propagate; real native windows |
| Empty/corrupt/unreadable/unsupported state | PASS | native fault matrix preserves bad bytes; no silent empty policy or decision overwrite |
| Primary missing with backup; incomplete staging | PASS | loads previous committed backup, never staging; no automatic primary write |
| RU/EN, dark/light, normal/390 CSS px | PASS | native input, full frames, overflow/contrast assertions; desktop emulation, not mobile |
| Keyboard, 200% application zoom, reduced motion | PASS | native keys and Electron zoom; reduced-motion media preference |
| Search, local check, audit chooser, batch, Recall, settings/history | PASS | interface smoke only; no provider action dispatched |
| Secondary map open/close/return | PASS | 154-note smoke, disposed data owner, list returns without graphical owner; no design/physics change |
| Repeated ItemView close/reopen | PASS | four cycles per size: view/facts/data disposed, listener set empty, semantic owner disposed |
| 1000-note inventory and semantic cap | PASS | all 1000 inventoried; too-large with no map; rule cannot bypass cap; explicit 66-note folder computes |
| Physical mobile, screen reader, other OS, Sync/multiple processes | NOT RUN | not represented by desktop emulation or offline fault injection |
| Every user theme/GPU compositor configuration | NOT RUN | built-in themes, X11 software-rendered acceptance only; no claim prior compositor incident is fixed |

The complete runs, screenshots, hashes and commands are indexed in
[review-stage-3-evidence/README.md](review-stage-3-evidence/README.md).
Unit results are **4714 tests / 176 files**, two typechecks, production build,
lint, diff-check and installer checks passed. Proposal audit killed **5/5**
mutations and all restored tests passed. The sole existing lint advisory is
`api.ts:442` streaming `fetch` / `no-restricted-globals`; zero lint errors.

## Upgrades, rollback and compatibility

The actual latest published compatible release was queried: tag `2.1.0`, commit
`6df435f1f1cd1f9421f908b816dcae02df1a4f9e`. Downloaded assets match GitHub's
three published SHA256 digests. No version was guessed or bumped.

Native upgrade cases use that release, #113 frozen source
`dd8191ebacc49fa0acf992a6281213de31658514`, and #114 source
`278e6b7c436ad6deb84f2d2a0479130f92bd31bf`. #113's supported Link operation is
actually applied before installing the integrated build, then loaded through
the existing History validators and undone by the new build. #114's rules and
decision are actually saved before upgrade and recovered afterward. These
transition phases are labelled separately from final-build acceptance.

The installer changes only main.js/manifest.json/styles.css, verifies hashes,
and saves prior files outside the vault. Clean install, three upgrade sources,
file retention, rollback and injected replacement failure are asserted on
isolated targets. Opaque byte probes are not claims that arbitrary journal
schemas are supported. Supported records use native History/Undo plus the
existing strict recovery tests; unknown/damaged formats remain refusals.

Settings/index/Recall/journals/backups/decisions/rules are not replaced by the
installer. Existing Recall v1→v3 migration is read-only on load; a later explicit
supported mutation serializes v3, as the unchanged migration suite asserts.
No new data schema is introduced. Multi-device/process writes and actual Sync
conflict handling are unsupported by this acceptance. Offline corrupt state
injection while stopped demonstrates safe refusal, not distributed locking.

Rollback: close Obsidian (or unload the plugin), use the printed external backup,
restore only the three plugin files, and remove a file only if that backup's
ABSENT marker identifies it as previously absent. Do not roll back data/index/
journal files. The installer reports partial replacement and the backup location
on failure; it does not promise automatic three-file transaction rollback.
The regression exercises manual restoration from that exact backup. Returning
to 2.1.0 does not promise access to later review features or newer operation
families; retain the evidence and return to this build for supported Undo.

## Measurements and limitations

Frozen native runs: list open ~265 ms empty, ~297 ms at 154, ~393 ms at 500,
~305 ms at 1000. Explicit connection refresh ~344 ms at 154 and ~854 ms at 500;
full-1000 refusal ~337 ms. Pair opening ~29 ms at 154. Main route local-fact
rechecks: 247, mean 15.6 ms, p95 50.6 ms, max 483.6 ms. These include harness
and real UI settling overhead on this machine, not FPS, SLA or worst-case bounds.

Incomplete development runs were retained locally and excluded from acceptance:
an unawaited CDP journal ID; an assertion treating section suspension as view
disposal; a smoke command invoking the old immediate audit instead of its chooser
(one synthetic loopback request, no external provider); an impossible all-cache
wait for zero-byte notes; and an upgrade assertion expecting session-only operation
summary before explicit History. Harness fixes align those checks with the actual
owners/contracts. No safety assertion or product guard was removed to pass.

## Stage 4 inclusion plan — not executed

Use **only this cumulative integration PR to main**, once its exact tested HEAD
and main have been rechecked and its three checks are completed/success. Prefer
a normal merge preserving the verified stack ancestry. Do not separately merge
or cherry-pick #106–114 as a second path. If main moves, integrate the new main
only here and repeat the affected acceptance/CI before inclusion.

After separately authorized inclusion, Stage 4 chooses the beta version and
supported Obsidian/desktop scope, prepares release notes, documents limits and
rollback, and verifies the release build/provenance. Version/tag/release changes
and retirement of superseded PRs require that later step; none happens here.
Local/native acceptance is GO for that preparation. The aggregate GO additionally
requires exact final-HEAD CI and artifact identity, recorded in the delivered
frozen report and PR; GO is not permission to merge or publish.
