# Product UX redesign — implementation audit

Base: PR #151, c9907f7603451c17bab70f92e1c1cc004b85d379; OPEN/DRAFT verified before work. Stacked stages: UX-A → UX-B → UX-C. No merge or release authorization.

| Existing surface | Destination | Preserved owner | Change |
|---|---|---|---|
| Workspace sidebar/Home/onboarding | Check; three horizontal destinations | HealthPluginController/preferences, VaultScopeIndex | One explicit local check, same-page result; remove duplicate branding |
| Health dashboard/Pulse | Compact check receipt | HealthService/ScanRun/reconciliation | Remove decorative wave, preserve recovery, freshness and truthful limits |
| Findings inbox | Check result with search, groups, bounded pages | FindingStore/lifecycle, existing R05 ports | All findings accessible; real source paths/evidence; no invented line numbers |
| Organization audit | Check/context menu | TaxonomySession/OrganizationRegistry | Keep advisory rules, decisions and write confirmation |
| Workbench/legacy visual routes | Notes | WorkbenchData, topology, semantic sessions | Preserve R06 routes, families, global focus, cancellation; UX-C structural mode |
| Processing/Tools/History | Material actions and compact menu | Existing tools, SafeApplyService, Studio | UX-B context; no new executor or universal transaction |
| Recall | Review top tab | RecallProductPort/FSRS/store | Navigation only; preserve queues and saved progress |
| Studio | Independent ItemView | RecipeRunner/operations/journals | Online Community UI centrally disabled; local recipes/import/export/generation retained |

## Coverage boundary

The local scanner is global; the folder picker does not change its source contract. Display scope and execution scope must remain distinct. LocalNoteSnapshot already distinguishes content/link availability and note-list completeness. The coordinator retains bounded diagnostics, but LocalHealthScanOutcome currently discards them. A transient, typed coverage receipt will expose existing facts/counts and bounded paths, without changing analyzers, reconciliation, journals, persisted schema or semantics. Counts not supplied (e.g. excluded inventory) stay unknown. Restart cannot restore transient diagnostics and must say so. Missing semantic data is independent of local link checks.

Broken-link findings store unresolved target/count, not exact tokens/line positions. Only the existing repair workflow rereads and verifies native positions; the list must not invent a line or token. First scan has no delta. Reconciliation counters do not alone establish comparable complete baselines, so no decorative trend is introduced.

## Safety and validation

Passive navigation: metadata and existing plugin-owned state only; no note content/network/writes. Explicit local check may read saved Markdown. Decisions persist through existing owners. R05 review/consent, source freshness, Apply/Undo and recovery remain unchanged. Separate baseline/after receipts; failed native runs retained. Native Xvfb/Openbox only. Public evidence synthetic; private copy/captures outside Git, no original-vault access. No real semantic-quality claim without a real index. All historical native gates stay open.

Official UI guidance: https://docs.obsidian.md/Reference/CSS%20variables/About%20styling and https://docs.obsidian.md/Plugins/User%20interface/Settings . Use existing ItemView, native DOM, Setting, setIcon and theme tokens; no new UI framework.

## Verified coverage diagnosis

A notes-only private copy (154 Markdown, 3 Canvas; no configuration or index) exposed 32 notes whose native metadata contains an empty internal target even after all caches exist. The existing source contract refuses that note's link evidence. UX-A retains that refusal and graph/reconciliation semantics; an optional transient reason now distinguishes missing cache, unsupported target, source change and unknown capture failure. No private paths or contents are published. A synthetic regression proves that an earlier valid edge in the same note is still excluded, and incomplete data cannot establish an orphan.

## Retired presentation checks

The former mandatory profile/result wizard, Home priority-card route and decorative Pulse no longer exist. Their navigation/presentation assertions were replaced by one-action checks, bounded complete-list access, exact scope handoffs, receipt honesty and passive IO checks. Storage, Apply/Undo, consent, recovery and source-freshness tests remain. Native scripts use the real new controls; Community workflows explicitly enable the internal test flag. Failed attempts remain separate from corrected runs.
