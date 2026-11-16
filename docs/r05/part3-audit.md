# R05.3 pre-implementation audit

Inspected main: `c75642e0b9eb0bf63b3128a9286304009a2011d2`, merged #144 and
#145. This is an implementation plan, not an acceptance claim. R06 is excluded.

| Existing capability | R05.3 requirement | Reuse | Unsafe reuse / required boundary |
| --- | --- | --- | --- |
| OrganizationDefinitions v1, strict profile and duplicate-key validation | Edit one explicitly selected definition | Existing validators and one connected OrganizationRegistry | Rebuilding `organizationDocument()` would discard user Markdown; splice only the unique supported fence body |
| Registry connect/create/disconnect, lazy read, events and subscribers | Validated in-place edit and refresh | Same active path, saved-note identity, registry notifications | `confirm(create)` is create-only and has no transactional Undo; never use it for overwriting |
| SafeApplyService and typed operation families | Durable registry Save/Undo | Common execution lock, cross-family blockers, source/editor guards, Vault.process, History | Old add_link/add_inline_tag/repair_wikilink records cannot represent a definitions edit |
| LocalNoteApply / LocalNoteJournal | Strict single-source operation and crash classification | Existing proven lifecycle pattern, immutable tickets, prepared/backup readbacks, append-only marks | Registry needs its own operation discriminator, transform validator and typed subjournal; no second global owner or arbitrary-patch API |
| Organization preferences and serialized settings queue | Durable leave/later/restore decisions | Existing compare-and-swap, persist-before-publish and subscription owners | Current opaque hashes depend on examples/counts; cannot reverse them or infer equivalence |
| Finding lifecycle / pair Review Decisions | Organization decision semantics | Persist-first approach and explicit restore | Findings have analyzer reconciliation and timed snooze; pair decisions bind two note contents. Neither owns aggregate organizational hypotheses |
| Organization suggestion eligibility | Stable relevant identity | Existing local audit, thresholds, exclusions and bounded main list | Counts/examples/time cannot be authority; retain full canonical relevant authority for new decisions, not only a compact display hash |
| v1 dismissed list, maximum 200 | Legacy compatibility and capacity management | Preserve every legacy ID; recognize only exact recomputation under the old algorithm | No automatic migration to guessed new IDs and no eviction. Explicit conversion/restore, visible full state |
| Settings-backed TaxonomySession | Optional confirmed rule without a registry | Existing separate Review and serialized save | Connected file stays sole source; no editable fallback copy |
| Native Xvfb/Openbox runner | Combined R05 acceptance | Existing disposable launcher and old regression harnesses | Historical PASS is not new evidence; first-modal/pointer and custom-frame limitations remain open |

## Proposed bounded contracts

- A registry operation changes one tag, convention or profile category, or removes
  one explicitly selected definition. Strictly reconstruct the expected JSON and
  exact single fence-body splice from the original Markdown and selected action.
  Surrounding Markdown and line endings remain untouched. Semantic no-op refuses
  without reserving a journal or writing. Reject ambiguous fences, invalid JSON,
  duplicates, future versions, BOM/byte mismatch, source identity/stat/content
  changes, unknown/open editors, registry switching and concurrent operations.
- Add `edit_organization_registry` under SafeApplyService with its own version-1
  `consolidation-registry-operations` journal. No changes to existing journal
  formats or records. Prepared copies precede writes; recovery is read-only, no
  automatic replay; exact Undo requires unchanged saved after-content and the
  same connected path. Revalidate/reload the registry after verified readback and
  notify existing consumers; failed refresh does not report success.
- New decision authority contains version, suggestion kind/literal value, scope,
  sorted exclusions and only applicable confirmed category/convention fields.
  Do not case-fold or Unicode-normalize. Compact UI IDs are not authorization;
  stored full authority is compared exactly. Count/example changes update the
  explanation, not the decision. Changed relevant rules/scope/exclusions produce
  a new authority; incomplete snapshots never resolve or delete a decision.
- Preferences v1 remain readable and unchanged on passive load. An explicit new
  decision may create v2 with the original `dismissed` list preserved and a
  separate typed decision list (`dismissed` or `deferred`). Total capacity stays
  200. No automatic expiry or eviction; restore/remove only explicit selected
  entries. Exact old-ID matches remain recognized; any promotion requires explicit
  confirmation and retains the old ID. Unrecoverable old IDs stay visible as
  opaque legacy decisions. Defer is not acceptance; opening Review is not acceptance.
- Current loadSettings deletes corrupt organization preferences. Preserve the raw
  value instead, fail closed for rules-dependent operations, and expose an error;
  no silent fallback or destructive repair. Unrelated settings saves must retain
  the raw original data. Test corrupt/future schema and queued conflicting saves.

## Verification plan

Test pure patch reconstruction, surrounding-byte preservation, unsupported fences,
duplicate keys, no-op, identity/content/settings/editor guards, journal damage,
backup/readback/marker failures, old journals, restart, one-shot tickets and
cross-family locks. Test stable authority and negative controls, legacy exact
matching/promotion, capacity, corrupt settings and persist-first concurrency.
Native: connected registry edit → Review/diff → Save → restart/reload → Undo;
leave/later/restore with unrelated-note rescan; RU/EN/themes/390px/keyboard and
split/popout. Re-run suitable R04, R05.1, R05.2, Studio, Recall, Community checks on
one frozen build and report the combined R05 acceptance matrix with explicit gates.
Resume Batch, versions/dependencies, release policy and R06–R15 remain unchanged.
