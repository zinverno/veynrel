# UX Reboot — Stage 1

Implementation and acceptance report for the approved Graphite & Amethyst composition.

## Base and dependencies

- Remote main inspected: `0df3167977a2a255b0faaaca998fdfa593d2971c`.
- Implementation base: `59e57842d8772b5804f7421428e9af5e53b31fa6` (open PR #104).
- Branch: `feat/ux-reboot-native-home-v1`. #104 must land first; its UX/Analyzer fixes are preserved by ancestry. No changes to that PR or #105.
- #105 (`75f4c3aac179bad416eea1f3f902b036976bd5f7`) supplies an existing synthetic lab; only a new isolated copy is used. Its product branch is not merged.

## Feature inventory and acceptance routes

| Capability | Existing owner / command | New entry | Actual scope | Access check |
| --- | --- | --- | --- | --- |
| Health, Knowledge Health | HealthPluginController / veynrel-open-health | Check → Health | Vault / existing profile | Native route + controller tests |
| Findings | FindingStore / Findings inbox | Check → Findings | Existing vault inbox filters | Native route + inbox tests |
| Full / Single Audit | getToolsPort.openDeepAudit → AuditModeModal | Check → audit selector; Tools | Existing audit modes | Native mode selector, no run |
| Batch, reports, backups | openBatchProcessing → BatchProcessModal / ai-batch-process, ai-hub-open-panel | Process; Tools | Modal's own explicit selection | Native modal, no processing |
| Search, related, duplicates | SemanticIntelligencePort | Map and search → existing Discover | Existing index / selected source | Native navigation, no index build |
| Topology | VaultTopologyPort | Check → topology | Existing vault metadata | Route test |
| Global map, neighborhood, comparison | Existing semantic ports | Map and search → Discover | Existing index, cap unchanged | Route tests |
| Ask Vault, MOC, legacy audit | VeynrelToolsPort | Tools | Existing index / saved clusters / vault | Shared launcher tests |
| Cards / Recall | RecallProductPort, RecallAuthoringPort | Review; Process → cards | Global queue; existing generation source | Native entry, no generation |
| Editor writing, selection, vault writing, Dataview, legacy atomization | Existing editor callbacks | Tools → explicit editor instructions; command/context menu | Concrete Markdown editor / selection | Existing command contracts |
| Safe consolidation / Empty Atom | Existing Pair Inspector, planners and executors | Map and search → duplicates → inspector | Explicit pair / target | Preserved owners; existing regressions |
| History, recovery | OperationHistoryModal; Health/Recall recovery; Batch backups | History; existing recovery surfaces | Existing journal / batch report | Native history + existing recovery tests |
| Companion / MCP / proposals | ConnectPort | Settings → Connect; Tools | Existing integration scope | Native settings/Connect |
| All provider/output settings | Existing product and native settings | Settings | Existing configuration | Existing settings contracts |

All existing public command IDs and `veynrel-health` view type remain unchanged.

## Scope and data semantics

`VaultScopeIndex` is a view-local UI projection, not a new engine. It enumerates
`Vault.getMarkdownFiles()` and `getAllFolders()` once on opening, then refreshes
on coalesced create/delete/rename events. It never reads note bodies. Folder
counts include descendants, with a `/` boundary; root notes belong to All.
The total is unique Markdown paths, not a sum of overlapping folder counts.
Canonical paths come from Obsidian, not basenames or generated topic names.

The initial six folders are sorted by exact full path. A selection outside the
first six replaces the sixth visible folder, so the selected area stays visible.
The native picker includes every folder, including empty and nested folders.
Deletion/rename of the selected folder or its ancestor creates an explicit missing
selection. Recreating the old path does not silently revive it. The user must
select again. Each leaf has its own selection, menu and motion state; nothing is
persisted in settings. Closing returns the next view to All.

The right panel counts **stored open Findings**, once per finding ID, when any
recorded `notePaths` member belongs to the selected area. It separately reports
findings whose recorded paths also cross the area boundary. This is a projection
of recorded evidence, not a fresh scan or exhaustive inferred dependency set.
It explicitly does not establish freshness or coverage. Missing/unavailable
storage has no numeric count. A known stored count is not a health score.

Due comes only from the existing Recall Health projection and refers to tracked
active cards in the global queue. Uninitialized/recovery/first-run state is `—`.
No inventory scan is triggered to fill this number. Folder due is unavailable;
“Open review” explicitly enters the global queue, with a scope handoff. A due
boundary uses the existing one-shot UI wakeup, in the view's owning window;
there is no scheduling algorithm change or polling loop.

“Open area” renders a local path list with a name/path filter, initially 80 rows
and explicit “Show more”; selecting a row delegates to existing safe note opening.
This list does not require an index. Existing semantic exploration remains below
it, with its real index states and limits. The decorative scene has no vectors,
model ranking, health score or note graph semantics.

## Routing and safety

The old primary tab rail is replaced by the sidebar. Check retains explicit
Findings and full/single audit entries; Process delegates to the existing batch
modal and MOC owner, with their existing scope and consequences disclosed.
History delegates to OperationHistoryModal and separately links to batch reports
and backups. Settings retains Connect/Companion/MCP and every provider setting.
Editor tools retain their concrete editor/selection command entries; the catalog
explains that context instead of guessing a previously active editor.

A folder is never passed to a service that has no scoped API. Such a transition
first explains the actual scope and requires an explicit Continue. The folder
selection stays visible and is recovered on returning Home. Scope handoffs are
single-use; switching scope, path invalidation, navigation or close invalidates
stale handoffs and late launcher feedback. Existing analysis/write permissions
are never inferred from selecting a folder. Onboarding and recovery retain
priority over the scene.

UI uses native DOM/SVG and the view's ownerDocument. SVG has no shared IDs or
external resources. Animation is CSS-only, with an accessible per-view toggle,
`prefers-reduced-motion`, and an IntersectionObserver that disables decoration
when the view is hidden; close disconnects it and removes metadata subscriptions.
Responsive layout uses **container width**, including narrow splits in a wide
window. New copy is RU/EN, names are text nodes, and focus is retained when
metadata or service snapshots update.

No changes to Apply/Undo executors, receipt/journal formats, strict evidence
validation, prompts, semantic algorithms, FSRS, manifest ID, command IDs,
dependencies or versions are part of the Stage 1 delta from #104.

## Next bounded stage

Scoped Recall remains required next. Its missing contract must accept an explicit
scope or frozen path set, expose scoped due/eligible counts and inventory freshness,
filter sessions without creating new card IDs or resetting schedules, leave skipped
cards untouched, invalidate deleted/renamed source paths and stale scope responses,
and retain the current single-session owner and persisted rating semantics.
Full maps, audit/batch surfaces and complex reviews can then move into the approved
visual system in separate bounded changes. Stage 1 does not complete the entire
UX Reboot.
