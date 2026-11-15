# R04 implementation audit and contracts

Base: `abef6366cc83611382baa36c688da109e573c178`; PRs #141 and #142 are merged.
This is an implementation plan, not a claim that acceptance checks have passed.

| Existing capability | R04 gap | Smallest change | Verification |
| --- | --- | --- | --- |
| `scanTaxonomy`, native `getAllTags`, exclusion predicate, bounded yielding/cancellation | Folder scope, folder/YAML observations, examples and snapshot identity | Extend the same scan with an optional organization collector and Workspace scope; no second tag scanner or note-body fallback | A–C, F–H; boundary exclusions; passive read counters |
| `VaultScopeIndex` and `includesScope` | Organization-specific launch with accurate scope | Pass the selected scope to the existing taxonomy surface from Workspace/Health; retain global Health scope | Folder/subfolder vs similarly named sibling; renamed/deleted scope |
| Taxonomy profile v1, strict validator and `saveSettings` queue | Optional file-backed definitions and unused allowed tags | One versioned Markdown registry wrapping the unchanged v1 profile plus explicit tag states and advisory conventions | Legacy settings, invalid/future schema, selected-file freshness, concurrent settings |
| `TaxonomySession` review/save and existing taxonomy UI | Observations vs hypotheses vs confirmed rules, bounded suggestions and dismissals | Extend the existing modal with a local summary and optional rules disclosure; reuse confirmed-profile editor | No-profile/no-tag cases, negative controls, dismissal across rescans |
| `watchTaxonomyFreshness` | Audit results must become stale after completion too | Retain a dirty listener until the existing modal closes; no event-triggered scans | Modify/rename/delete/cache events; close/cancel |
| Tag Recommendations v1 | Active file definitions must not compete with settings | Existing profile port resolves the selected registry or fails closed until explicitly loaded; block settings-profile editing while linked | AI consent invalidated by source changes; no bypass of existing profile/inventory requirements |
| Isolated native runner | R04 workflow coverage | One new allowlisted scenario using the shared session module | Xvfb only; native screenshots/video, counters, keyboard, split/popout |

## Necessary new contracts

1. **Organization snapshot**, session-only: selected scope/exclusions, source identities
   and stat revisions, timestamps, examined/excluded/unknown counts, bounded examples,
   literal folder/tag/property/type observations and completeness. Public metadata
   does not expose a saved-file freshness proof: cached absence is not proof of
   source absence. Report this limitation even when enumeration completes. Events
   invalidate a result; they never automatically rescan. No note content is stored.
2. **Registry v1**, optional Markdown with one `veynrel-organization` JSON fence:
   unchanged `TagTaxonomyProfile` v1, literal allowed/excluded/deprecated tag entries,
   and human-confirmed advisory folder/property/type conventions. Strict bounds and
   validation; no name normalization, inferred synonyms or reinterpretation of
   `flashcards/...`. Existing Markdown is read and previewed, never rewritten by R04.
   Creation is create-only, after full content review and separate confirmation.
3. **One active definition source**: explicit user settings/exclusions → selected
   validated registry (otherwise the legacy confirmed profile) → cached observations
   → hypotheses. With a registry selected, legacy profile storage is retained as an
   explicitly dormant fallback and cannot be edited through the profile port. An
   unloaded/missing/invalid/changed registry does not silently fall back. Disconnect
   explicitly reactivates the unchanged legacy profile; it never copies file rules.
4. **Small preference extension**, through the existing serialized settings owner:
   selected registry path and bounded dismissed suggestion identities only. No
   inventories, note text, source lists or model output in settings. Preserve
   unrelated settings and detect stale confirmation through compare-and-swap.

Local suggestions will reuse literal existing structure, with small deterministic
thresholds described as eligibility heuristics rather than quality/confidence.
No new tag/type, semantic equivalence, automatic note edits or whole-vault AI.
R05 owns concrete changes to notes. Existing model contracts and limits remain.
