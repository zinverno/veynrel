# R05.2 — bounded local actions: implementation audit

Inspected base: `0beb6d65ee88e0e3eaeb9eca057fb5315ae9606d` (R05.1 merged).
Development only; this document does not claim delivery or public availability.

| Action | Admissible Markdown patch | Checks | Journal | Undo | Negative controls |
| --- | --- | --- | --- | --- | --- |
| Add one explicitly selected tag | Insert one inline tag at a checked plain paragraph; no YAML serialization | Exact saved source and native metadata, case-insensitive inline/YAML absence, valid syntax, closed editors, active definitions and exclusions | New typed local-action subjournal under SafeApplyService; never v1 `add_link` | Exact saved after → before, original identity, closed editors; otherwise refuse | Existing tag, unknown cache, excluded/deprecated/flashcard tag, ambiguous markup, changed registry, BOM |
| Repair one broken wiki-link | Replace exactly one cache-positioned plain `[[target]]` with `[[full/path]]` | Exact token and position, still unresolved, selected target identity and native resolution, full saved source, closed editors | Same typed family with distinct `repair_wikilink` discriminator and transform validation | Same exact-content contract; source only | Repeated token, alias/embed/heading/block/escape, code, same basenames, moved target, stale cache |
| Both operations | One note only; all other bytes unchanged | TFile identity, ctime/mtime/size/content; review and post-backup revalidation; synchronous Vault.process guard; readback | Durable two-copy prepared evidence, immutable markers, one-use reservation; damage blocks, no replay | Restart classification is read-only; recovery requires explicit review | Double Apply, backup failure, write refusal, interrupted marker, partial journal, user edits, concurrent operations |

## Reused owners and boundaries

The inspected `OperationJournal` v1 validates only `add_link` and
`replace_with_embed`. Its format and old records remain unchanged. The existing
SafeApplyService owns execution, cross-family blockers, disposable review tickets,
History and lifetime. A new family must participate in all of those gates.
`readSavedNote`, `guardSavedEditors`, `Vault.process`, native metadata positions,
Taxonomy inventory and OrganizationRegistry remain authoritative. No second tag
scanner, editable taxonomy, general patch engine or model transport is needed.

R05.1's UTF-8 byte-size guard remains: Obsidian may omit a BOM from Vault.read
while Vault.process receives it. Such a source is refused before journaling.
A connected registry is protected knowledge content and the sole definitions
source; corruption or change revokes a prepared tagging plan. Settings-backed
rules are not silently substituted. R05.3 owns registry edits and dismissal IDs.

The integration surface includes native adapter/owner, journal/history, local
planning/review modal, existing Workspace/Findings ports, R04 contextual entry,
RU/EN strings, focused contracts and native runner scenarios. Legacy Batch,
Recall, Studio write contracts, versions and dependencies are outside this diff.
