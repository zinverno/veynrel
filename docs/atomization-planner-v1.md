# Knowledge Atomization Planner v1 — verified extraction preview

Atomization is an explicit, local, read-only **copy plan** for one knowledge unit that the user judges independently useful. Open Knowledge Consolidation → Pair Inspector → an existing Relationship Analyzer result → Change Planner → **Atomization — verified extraction**. No new model request occurs after entering the planner. The Analyzer itself still needs its existing separate consent/request; this PR does not create an analysis-free entry point.

## Legacy and verified extraction are separate tools

| | Legacy `ai-atomize-note` | New Change Planner option |
|---|---|---|
| Entry | Editor command / existing Tools action | Explicit Change Planner operation |
| Input | Current saved note, existing model settings | Two saved notes bound to the existing Analyzer result; user selects one source |
| Text | LLM generates titles and bodies | Native whole ranges copied verbatim |
| Side effects | Creates files; appends the localized “Атомарные заметки” / “Atomic notes” section to the original | No file creation, Markdown mutation, journal, provider call, or persistence |
| Location | Existing `atomsLocation` / `atomsFolder`, free-name generation | User explicitly enters a title and complete path; no auto-renaming |
| Confirmation | Existing legacy behavior | Separate unchecked confirmations for knowledge unit, context, title, source link and dependencies; manual selection needs another confirmation |
| Execution | `atomizeNote()` → `createAtomicNotes()` | No Apply button, callback, service or executor |

`main.ts`, command IDs, settings, defaults, prompt and legacy generation behavior are unchanged. Legacy concurrent calls still share the existing task; creation errors still use its existing handling. This new contract is not wired to that generator or any Safe Apply service.

## Supported information and refusal policy

The user selects a whole native paragraph or a complete simple heading branch. Offsets are exact UTF-16 positions in saved Markdown, not model quote positions. Full source text is available for review.

- Plain paragraphs require complete MetadataCache coverage and the shared plain-paragraph checks. A note with headings, properties or other structured blocks cannot donate a bare paragraph. Conditions inside a paragraph remain byte-for-byte present. Dependencies between plain paragraphs remain a user context judgment, never a parser or LLM independence claim.
- H1/H2/H3 branches use `contextGroups()` and its existing structural checks. Ancestor heading/introduction ranges travel with the selected section in original order. No renaming, heading-level conversion, preamble loss or selection of partial list/section boundaries is allowed. The original H1–H3 text is preserved even when an additional user title appears above it.
- Links, embeds, reference definitions, tags, blocks, code, lists, quotes, HTML and other protected structures are refused in v1. Attributed blockquotes are deliberately refused too: their richer attribution contract is outside this initial subset. Quotation marks in otherwise plain copied text are also refused. The UI lists structurally refused ranges and their reasons.
- `standalone_a` / `standalone_b` are advisory provenance only. Even a matching `consider_atomize` quote needs native ranges and the user's independence/context review. With no matching standalone hint, a separate manual-selection checkbox is required. Nothing is preselected or automatically built.
- Known context claims intersecting a copied range block the plan. Conflicts, version differences and insufficient context block it even with every checkbox selected. Unknown external dependencies are prominently disclosed. Manual confirmation is an assertion by the user, not proof of semantic independence.

Changing source, range, title, path or operation clears confirmations and preview. Typing invalidates immediately, preserves focus/caret, and performs no reads. Cancel, close, invalidate and selection-generation changes suppress late reads. Reopening starts with blank choices. Vault and metadata events invalidate without automatic rereading.

## Destination and exact preview

Use a full `.md` path within an **existing** ordinary vault folder. The planner never creates folders. Canonical path checks refuse traversal, absolute paths, hidden components, `Vault.configDir` (including custom names), `node_modules`, reserved device names, control/format characters, link delimiters, ambiguous separators and unsafe portable filename characters. Case and NFKC-normalized collisions are refused, including identical basenames elsewhere and attachments with a different extension.

On explicit Build, the metadata-only inventory includes all loaded files/folders, native identities/stats, cache fingerprints and resolved/unresolved link observations. The adapter checks exact destination absence, including a path not yet in the loaded inventory. Existing links, embeds, frontmatter links and aliases that could capture the new name block it. Missing Markdown metadata fails closed. Parent folder ambiguity and source-link resolution from the **future path** are checked. This is conservative cache evidence, not a claim to have inspected external links or unindexed files.

The complete generated Markdown is:

1. An explicitly confirmed, user-entered `# Title`.
2. Exact parent context ranges and selected range, in original order.
3. The explicitly confirmed `Source: [[full/vault/path/to/source]]` line.

The separators follow the source's LF or CRLF convention. The title, source line and separators are recorded separately from the copied source. The UI displays added title/source text separately and the complete final file as literal text, without rendering embeds, HTML or network content. No claims are synthesized. Source `remaining` is exactly its complete original Markdown. There are no implicit changes to other notes or backlinks.

## Independent validation contract

`AtomizationPlan` version 1 uses operation `atomization_preview` and `readOnly: true`. It is JSON-serializable and is neither `MergePlan` nor `GroupPlan`. It records:

- Source path, session-local native identity token, ctime/mtime/byte size, full Markdown, unchanged remaining text and change-detection checksum.
- Selected kind/exact range, dependent context ranges, and reasons for refusing other ranges.
- Destination path, checked absence, parent/name/link/cache observations and complete future Markdown.
- Separately confirmed added title/source text and separator, all user confirmations, analysis/hint/manual provenance and limitations.
- Both original analysis sources and their identities, stats, full text, metadata and resolved outgoing references.

`validateAtomizationPlan()` rebuilds the complete plan from current trusted inputs and requires exact JSON equality. Added fields and changed content, structure, choices, destination, observations or analysis fail validation. The session rereads the two saved sources and reobserves dependencies before publication, pins the original analysis, and rejects identity/stat/cache/reference/resolver drift. Full source strings are compared; `stableHash` is a non-cryptographic change detector, not an authorization token. Identity tokens are session-local; saved/exported JSON would not authorize Apply in a later session.

Only the two selected Markdown files are read. Destination inspection consults vault metadata and `adapter.exists`; it does not read other Markdown, journals or model data. There is no write or completion capability in the atomization modules. The existing global modal listeners invalidate previews on any potentially relevant vault/cache change.

## Future Apply and crash-safe Undo (design only)

A future executor must be a separate operation and consent flow, never dispatch this preview into legacy atomization. It must reuse the plugin-wide operation exclusion/blocker checks and freshly revalidate the full source, destination absence, dependencies, source link, editors and exact proposed text. Session identity must be replaced with verified durable evidence for restart recovery. Use SHA-256 for durable records and exact text comparisons; v1's preview checksum is insufficient for authorization.

The smallest future operation creates **one new file containing the source link**. The source remains untouched. Obsidian can observe that ordinary link; no backlink files need rewriting. Reciprocal source annotations, directory creation and multi-file edits would require separately previewed plans and consent.

A safe sequence must record durable immutable intent (operation ID, full source evidence, exact target path/content/hash, confirmed additions and absence evidence) before requesting creation. An existence check followed by a write is not sufficient protection against a concurrent creator: the executor needs a demonstrated exclusive, no-overwrite creation primitive on supported adapters, or it must refuse execution. This PR makes no claim that the existing public API supplies cross-process transactions.

After creation, read back exact bytes and native identity, then durably acknowledge a creation receipt. Never retry an ambiguous create automatically. Recovery distinguishes:

| Crash point | Required behavior |
|---|---|
| Before acknowledged intent | No authorized creation; inspect any partial record, do not mutate Markdown |
| After intent, target absent | No automatic create; obtain a fresh review |
| Target exists, receipt missing/torn | Inspect exact content and ownership evidence; identical text alone does not prove this operation created it. Keep ambiguous cases blocked; never delete another writer's file |
| Verified receipt committed | Show created state only after identity/content/source-link checks |
| Undo intent recorded, deletion/trash not acknowledged | Reconcile the actual file and operation-owned trash evidence; do not blindly repeat a destructive operation |
| File changed, moved, replaced, or new dependencies appeared | Conflict; preserve current content and recovery evidence |

Undo needs separate confirmation, a durable undo intent, exact current content/identity matching the committed creation receipt, and dependency review. It may remove/trash **only the file demonstrably owned by this operation**. The untouched source needs no restoration. A crash window without durable proof of ownership remains unresolved rather than treating “same path and hash” as permission to delete. If stronger ownership needs an operation marker inside Markdown, that marker must first become an explicit previewed/confirmed addition in a later plan version; it must not be silently injected by Apply. Write/read-back/receipt failures remain visible, with no background recovery writes.

See [native acceptance and validation](atomization-planner-native.md) for measured evidence and platform limits. No Apply, Undo, new journal, version bump, release or setting is part of this PR.
