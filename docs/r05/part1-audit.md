# R05.1 — finding, local link review and supported Undo

Base: `8f1546c0cb8d5c6cc5af713d0f18ed309a8152ff` (R04 merged).
This is the first bounded part of R05, not acceptance of the whole stage.
Development remains unpublished 2.4.0; public 2.3.1 does not include this work.

## Audit before implementation

| Observation | Available action | Existing owner / executor | Missing piece | Risk |
| --- | --- | --- | --- | --- |
| Broken-link finding | Open the real source; inspect the literal unresolved target | Health finding evidence / `openHealthNote` | No checked repair of a selected occurrence | `add_link` appends a different link; it must not be presented as repair. |
| Same basename, exact copies, semantic pair candidate | Open both saved notes; inspect pair; explicitly keep as is | `PairReview`, `readRelationshipPair`, Review Decisions | Direct route from the selected finding with its evidence/context | Names/similarity do not prove semantic equivalence. Group representatives are not the entire group. |
| User chooses a directed link between two notes | Exact whole plain-paragraph insertion, separate Review/Apply, journal and Undo | `changePlan`, `readPlannerPair`, plugin-owned `SafeApplyService`, `OperationJournal` v1 | Current entry requires Relationship Analyzer output; add a separately typed local user-origin entry, without inventing analysis | Preserve the existing splice, full-path resolution, structural checks, closed-editor guards and single-use tickets. |
| Reciprocal links | Checked two-file plan and separate executor | `multiFilePlan`, `MultiFileApply` under the shared owner | No change needed in this part | Not a generic multi-file patch protocol. |
| Merge / bundle / group / archive | Operation-specific plans, journals, recovery and Undo | Existing eight journal families under `SafeApplyService` | No change needed in this part | Copy, archive and recovery are different contracts, not generic replacement. |
| Observed or allowed-unused tag | Inventory / declarations / model recommendation review | Taxonomy inventory, `TagRecommendationSession`, R04 definitions | No note-tag executor or compatible recovery record | Single-file journal validation accepts only its exact link/embed splices. YAML and tag semantics require a separately tested contract. |
| Save a settings-backed rule | Review then save against expected base, through the owner queue | `TaxonomySession`, `TaxonomyProfilePort` | Existing route remains available | Never update the dormant settings profile while file-backed rules are active. |
| Connected registry | Validate/connect, create a new document, disconnect | `OrganizationRegistry` | No in-place edit plan preserving surrounding Markdown | Registry editing is a distinct mutation with source freshness, consent and format bounds. |
| Keep / later | Dismiss or snooze a Finding; independently keep a content-bound pair | Finding lifecycle/reconciliation and Review Decisions | Expose existing decisions alongside concrete actions | Do not mark a Finding resolved because a plan was opened or a different link was written. Partial scans prove no resolution. |
| R04 dismissal | Exclude an exact stored `org:` ID | `organizationSuggestions`, organization preferences | Current ID includes the overall processed count and aggregate fact; unrelated additions can change it | Old opaque hashes contain no recoverable basis. Stable identity and honest legacy compatibility need a separate R05 part, not guessed migration. |

The inspected Single Safe Apply validates `add_link` or `replace_with_embed`,
full before/after text and one exact selected splice. Its journal stores no LLM
authority. This permits a **local, user-chosen `add_link` plan** to reuse the same
executor and unchanged v1 record after equivalent fresh structural validation.
It does not permit a tag or broken-link operation to impersonate `add_link`.

## Delivery boundary and dependencies

1. **R05.1 (this PR):** up to three concrete next-review suggestions in the existing
   Workspace, selected-finding context, actual Pair Inspector and note routes,
   and a complete local link prepare → exact diff → explicit Apply → supported
   Undo/history route. No model is needed for this new link action. Existing
   Relationship Analyzer consent and operations remain available separately.
2. **R05.2 (after R05.1 review):** bounded broken-link occurrence repair and
   manual/observed/allowed tag selection with their own admissible Markdown
   transformations, journal/recovery compatibility and negative controls.
3. **R05.3 (after R05.2):** separately confirmed in-place registry edits and stable
   organization recommendation decisions, including explicit handling of old
   opaque dismissed IDs that cannot be losslessly reconstructed.

Only this PR is authorized for delivery now; the follow-up units are dependencies,
not an instruction to open a chain of PRs. R05 remains incomplete until its other
routes and acceptance cases are delivered and reviewed. R06–R15 are untouched.

## Local action contract to verify

- Both canonical Markdown paths and the direction are explicitly selected. The
  new link has user origin, not a fabricated model assessment or a profile rule.
  Organization definitions are not consumed; the active registry itself is
  protected from this knowledge-note action.
- Read complete saved sources and snapshot `TFile` identity, ctime/mtime/size,
  metadata/references and full-path resolution. Build only the existing checked
  plain-paragraph ` [[full/path]]` insertion. Preserve BOM, CRLF, Unicode and all
  unselected bytes; reject protected/ambiguous ranges and existing connections.
- Rebuild and compare on review, final confirmation and after durable backup;
  check again inside `Vault.process`. Do not use `Vault.modify` or adapter writes
  for note content. Both notes' open Markdown/editor/popout leaves block Apply,
  even if their public buffers equal disk, because queued saves cannot be locked.
- Reuse the shared execution owner, reservations, journal readback and exact
  Undo/recovery. No new journal format, automatic retry or universal Undo.
- Keep Finding dismissal/snooze, pair decisions and actual operation receipts
  separate. A write does not automatically resolve the originating Finding.
- No passive note reads, model calls or Markdown writes from listing suggestions.
  Pair/source reads and planning happen only after explicit user actions.

The R04 first-modal gate remains documented. This part does not investigate it
again or claim that a successful native R05 run resolves it.
