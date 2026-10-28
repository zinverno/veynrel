# Studio UX reset

Plugin branch: `feat/studio-ux-reset-v1`, dependent on open PR #124 at `e3651e4bf805ddd4d73c5e55195a63ded4a06101`. Catalog base: merged main `183250019abf26f6f039002ca29b64f43d11bec0`. Both were checked live before work. No repository/ancestor AGENTS.md or tracked Graphify graph at these checkouts; actual source and callers were traced. Existing user worktrees were left intact.

## Observed problems and changes

| Evidence from baseline | User consequence | Change | Verification |
|---|---|---|---|
| RU 390px library: first recipe near bottom; large header, five equal navigation buttons, repeated intro | Hard to identify a useful task | Four primary destinations, compact operation return, task heading and dense rows | Matched native library screenshots |
| Setup locals are recreated by `setup()` | Back/navigation loses selection and typed instructions | Per-recipe in-memory UI draft; no note bodies, credentials or persistent authority | Native return/query/selection/instructions/focus assertions |
| Markdown Review renders every diff in a vertical stack | Multi-file review becomes long and selection is difficult to scan | File list, statuses and checkboxes; one selected literal diff; selected count and action above content | Existing explicit-scope Apply/Undo plus native Review checks |
| Diagram split screenshot has no visible canvas, because introductions/warnings precede it | Diagram is secondary to prose | Source/path/count, short semantic caution, canvas, collapsible inspector; creation action above stage | Two visual iterations and unchanged real Excalidraw harness |
| Diagram source uses all-file select and destination one long free-text path | Homonyms hard to locate; folder/name must be typed together | Shared searchable metadata-only picker; existing-folder choice and separate name, exact destination always visible | Real native prepare/consent/create route |
| Community full prompt, JSON and examples are all expanded | Task/example buried in diagnostics | Purpose and fictional examples first; instruction, limits, raw JSON and hash disclosures | Community install/edit/update/offline regression |
| Editor close has no draft warning | Typed input can disappear silently | Inline discard/continue confirmation in the same modal; active language first, required translation retained | Native dirty-close test |

## Boundaries and choices

`runner`, `apply`, journals, recipe schemas, prompts, catalog checks, adapter, layout and transport are unchanged. The only owner addition is a read-only projection of provider/model/baseUrl and folder metadata for preparation. It exposes no API key and invokes no test request. Engine scope and exact-path validation remain authoritative. No persisted UI snapshots, automatic repeat, auto-update or hidden folder creation.

The UI uses shared native field/select/button/disclosure/toolbar/picker helpers. No dependency was added. Preview is literal text/SVG; neither MarkdownRenderer nor HTML parsing nor external resources are introduced. Cached diagram DOM retains viewport for the same frozen plan; changing the plan makes a new preview. Native scroll and pointer pan plus local zoom/fit buttons require no window listeners or polling.

The smaller implementation uses sequential detail navigation instead of a permanent library sidebar. Markdown has list/detail because it makes explicit selection visible. The diagram inspector is optional and only takes a side column in a wide leaf. No per-hunk acceptance or graph editing is implied.

## Review route

1. Open Studio → Library, search a task, inspect its result and choose notes.
2. Search full paths, select notes, enter instructions. Visit another section and return: the UI draft remains. Prepare, review exact payload, then separately consent to generation.
3. Review one file at a time; explicitly select changes, review writes, and confirm Apply. Close saved affected editors before Apply; no new model request is needed after an editor refusal. History offers guarded Undo where proven available.
4. Community is passive until Open online catalog. Inspect purpose/examples, full prompt and version; installation remains separate from running.
5. Create diagram: choose one note, existing folder and name. Review the exact request; generate. Inspect canvas, zoom/fit and textual graph. Update parameters locally before confirming the exact new path. Open the created drawing; an opening error is not a reason to create again.

See [references](studio-ux-references.md) and [evidence](studio-ux-reset-evidence/README.md). Synthetic integration proves workflow boundaries, not model usefulness. Manual owner acceptance and real-model quality remain NOT RUN.
