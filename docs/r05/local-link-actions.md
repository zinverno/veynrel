# R05.1 — review a finding and add a local link

This is **unpublished development**, not public stable 2.3.1. It is one bounded
part of R05; [remaining R05 parts and dependencies](part1-audit.md#delivery-boundary-and-dependencies)
are not delivered by this change. Version 2.4.0, dependencies, journal formats and
the single-public-release-after-R15 policy are unchanged.

## Starting from a finding

Workspace Home offers at most three next steps from existing open findings in
the selected area. The shortlist admits evidence-backed broken-link source
reviews and concrete comparison pairs. Informational findings, linkless diaries,
rare tags, age and frequency do not create extra tasks here. It orders admitted
items by existing impact, then deterministic/high/medium evidence, with stable
ID ties. It is an engineering heuristic, not a model's judgment or a measure of
user benefit. All other observations remain available in Findings.

Choose **Review the evidence**. The detail names the stored observation, its
recorded date, origin, affected paths and limitations. An old or partial scan is
not called a fresh complete check. **Compare this pair** mounts the existing Pair
Inspector for those exact paths, preserving the originating inbox underneath.
For a larger group, this is only the named representative pair, not every member.
An out-of-folder target remains explicitly visible; this operation does not
process a whole selected folder or vault.

Read the saved sources in the inspector, or open their actual notes. Matching
titles, matching text and semantic proximity do not prove equal purpose. The
existing relationship analysis remains a separate model action with its own
consent; the new link route never needs it or fabricates its output.

## Prepare, review, apply and undo

1. Choose **Prepare a link without a model**.
2. Select the exact source → target direction and a native plain paragraph.
   Existing links, ambiguous target resolution and protected Markdown are refused.
3. Read the full selected paragraph and confirm the insertion point. The only
   edit is ` [[vault/relative/target]]` immediately after that paragraph.
4. Choose **Check and apply**. This opens the existing separate consent window
   with the full original/proposed Markdown and a line diff. No note or operation
   journal has been written yet.
5. Confirm **Apply this change**. Both sources are reread, identity/ctime/mtime/
   byte size and metadata/resolution rechecked, and the existing two durable
   journal copies verified. The executor checks again after backup IO and inside
   `Vault.process`, then verifies the saved result and records the outcome.
6. **Undo** opens another review and separate confirmation. It restores the exact
   original content only while the supported identity/content checks still pass.
   History remains available across plugin/Obsidian restarts; recovery never
   automatically reapplies or undoes an operation.

Close both affected notes in **all** editors, splits and popouts before preparing
write consent, even when their visible buffers equal disk. The public API cannot
lock a delayed editor save. Veynrel neither closes nor silently saves those views.
Later source edits, replacement, rename/delete, changed target resolution,
metadata changes and a newly selected protected registry require a new plan.

The connected organization registry is protected from this new note action.
The plan does not consume taxonomy definitions or change the settings-backed
profile, rules, tags or registry. It has explicit **user** origin. No provider,
model, model recommendation or estimated model price is invented.

## Encoding and structural limits

Both notes are bounded to 200,000 UTF-16 units / 800,000 bytes. Only native whole
plain-paragraph ranges are eligible. Frontmatter, code, existing links and richer
inline markup are not rewritten; surrounding content remains unchanged.

The native test found that Obsidian 1.13.7 strips an initial UTF-8 BOM from
`Vault.read`, while `Vault.process` receives the original text. The existing exact
callback guard prevented any write. The new entry now rejects a read whose UTF-8
byte size differs from the file stat **before preparing a journal**. BOM or other
non-round-tripping encodings take the manual route. CRLF and Unicode without a
stripped BOM passed actual write and byte-exact Undo checks; a pure plan test is
not presented as proof that Obsidian preserves a BOM.

A missing/lagging cache or uncertain structure is a refusal, not permission to use
regex or an unconditional write. There is no tag/YAML editor, broken-link
replacement, note merge or universal patch/Undo executor in this part.

## Decisions and recovery

- Opening a pair or preparing a plan means **consider**, never **applied**.
- Finding **Dismiss** preserves the existing finding-level decision; **Snooze**
  postpones it without resolving it. Partial scans cannot prove disappearance.
- Pair Inspector **Leave as is** preserves its separate content-bound Review
  Decision. It does not silently dismiss a group finding or become a vault rule.
- **Applied/undone** comes only from the actual operation receipt. Adding a link
  does not automatically resolve the originating finding.

Single Apply's v1 journal still accepts only its exact `add_link` and
`replace_with_embed` transformations. Local links reuse the same plugin-wide
execution owner and reservations as all existing operation families. Old records
need no migration. A crash after writing but before the applied marker is
classified from saved content, with a fresh Undo review where supported. A changed
result or damaged evidence disables automatic recovery and retains the backups.

Records and their backup copies remain under
`.obsidian/plugins/ai-knowledge-hub/consolidation-operations/` (or the vault's
configured Obsidian config directory). Do not overwrite a changed note with a
backup without first checking the entire current file and operation history.

When a Workspace folder is selected, the existing one-use scope confirmation
still precedes the global Findings/Health view. The pair plan always names its
actual two-file read scope and one-file write scope. No scope gate is bypassed.
