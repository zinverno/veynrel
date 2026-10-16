# Tag Recommendations v1

Open **Veynrel → Tools → Tag Taxonomy**, save a confirmed category profile, then
run **Analyze tags** explicitly. Choose one Markdown note by its **full path**,
click **Recommend tags**, inspect the provider/model/destination, complete request
body and size, then **Confirm and send**. Each new analysis requires new consent.
RU labels: **Таксономия тегов → Проанализировать теги → Выбрать заметку по полному
пути → Рекомендовать теги → Подтвердить и отправить**.

Opening Tools/the modal, scanning metadata, and choosing a file make **no LLM
requests**. Scanning remains metadata-only. Only explicit request preparation and
confirmation read the selected saved source. Markdown is never written. Decisions,
embeddings and a new API key are not involved; this uses the existing Deep
Intelligence model configuration and transport.

## Confirmed rules and observed tags

The saved `tagTaxonomyProfile` is authoritative. Draft editor changes and suggested
prefix groupings are **not** substituted for confirmed rules. Save/reload the
profile when appropriate; the request preview contains the exact confirmed profile.
Existing settings persistence is unchanged; the profile port now exposes commit
notifications so temporary analyses can be invalidated.

The inventory comes from the existing explicit `scanTaxonomy` path:
`getMarkdownFiles()`, native `getAllTags()` over MetadataCache, note-level
deduplication and existing exclusions. It is kept only in the open modal. It
contains literal observed names, including their language, case and hierarchy;
virtual tree nodes are not invented tag candidates. No body scan or semantic tag
normalization is added.

A recommendation uses the **entire bounded inventory of eligible notes**, including
unassigned tags for comparison. An existing recommended tag must occur literally
in that inventory **and** belong to the named category by the confirmed first-level
prefix or explicit flat-tag assignment. Unassigned tags are not silently assigned.
Incomplete, cancelled, limited or known-stale inventories are refused. Any missing
metadata also blocks sending. A new scan is required after reopening the modal.

The cache is still an observation, not a verified copy of every saved file. Cache
lag, excluded notes, and unsaved edits remain unknown. A temporary dirty listener
starts with an explicit scan and lives until modal close. Vault or metadata events
invalidate the snapshot and analyses; they never trigger a scan, body read or
request. No background audit or persistent index exists.

## Recommendations and evidence

The response has exactly `categories` and `limitations`. Each confirmed category
appears once with:

- `categoryId`, `status` (`recommend`, `none`, `insufficient_context`),
  `explanation` and a source `quote`;
- `existing` suggestions: literal `tag` and `evidence: {text, quote}`;
- `proposed` new tags: the same evidence plus `nearest: [{tag, difference}]` and
  `limitations`;
- `basis`: grounded domain/prerequisite evidence where policy requires it,
  otherwise `null`.

Only `insufficient_context` may omit the overall quote (`null`). All supplied
quotes must have one exact contiguous occurrence in the complete saved Markdown.
Ambiguous, missing or invented quotes withhold **the whole response**. The check
proves literal presence only, not the model's interpretation, useful taxonomy,
semantic uniqueness, correctness of prerequisites or expected future reuse.

Unknown/duplicate JSON keys (including escaped aliases), invalid JSON, unknown
categories, unknown existing tags, duplicate recommendations, unsupported new-tag
syntax, missing comparisons and policy violations also withhold the response.
Numeric percentage claims in model prose are also refused; source quotes may
contain literal percentages. There is no partial acceptance, automatic repair or retry, raw provider error
disclosure, generated confidence score, diff or Apply control. Provider prose and
excerpts are text nodes, never rendered Markdown/HTML/embeds.

`one_primary` permits at most one combined existing/new suggestion per category;
`multiple` permits up to five. This is a recommendation policy, not a prohibition
on user exceptions in their notes. The prompt keeps a small contextual practical
example from automatically changing a theory note's main role. Difficulty requires
quoted prerequisite evidence, and `interpretation: domain` additionally requires
quoted domain evidence. Global difficulty can omit a domain; other global
categories have no basis object. When these grounds are unavailable, the model
must abstain. Categories are never mandatory, and document `type: moc/atom` does
not establish content role.

A new tag must explain its classification purpose and why observed alternatives
are inadequate. Nearest comparisons must name real transmitted tags (at least
one from the category if it has candidates). Existing and proposed tags appear
in separate sections. Host UI always discloses unknown future reuse and possible
unobserved existing tags. Similar names are not declared synonyms.

New nested tags must retain a confirmed category prefix. A new flat tag may be
proposed for an existing category without creating a binding. New category
proposals are deferred: edit and confirm categories in the profile first. v1
accepts a conservative new-tag subset: Unicode letters/marks/numbers, `_`, `-`,
and nonempty `/` levels, with at least one letter, underscore or hyphen; maximum
128 UTF-16 units and eight levels. Existing observed tags are preserved even if
they fall outside that new-tag subset. [Obsidian tag documentation](https://obsidian.md/help/tags)
allows broader Unicode, including emoji, and treats case variants as the same tag.
Accordingly, a case-only new duplicate is rejected without rewriting existing
spellings. Emoji proposals and more permissive new-tag syntax are deferred.

## Complete input limits and privacy

| Input/output | v1 bound |
| --- | --- |
| Own saved Markdown | 20,000 UTF-16 units |
| Eligible-scope observed tag names | 500, all included |
| Confirmed categories | 16, all included |
| Serialized request body | 131,072 UTF-8 bytes |
| Response | 64,000 UTF-16 units; transport maximum 6,000 output tokens |
| Each exact quote | 1–1,200 UTF-16 units, nonblank, unique occurrence |

Exceeding a bound refuses the **whole** analysis. There is no truncated source or
selected subset presented as complete. The note's byte stat is also checked before
reading to reject files that cannot fit (over 80,000 bytes). Providers can impose
smaller context/output limits; their errors are shown without retry.

The destination receives a system prompt, the **full saved Markdown** (including
frontmatter and any authored names, paths or links), the **confirmed profile**, and
**all bounded observed tag names**. Counts and selected file path are shown locally,
not separately added to the request. Embedded targets are not loaded. The exact
serialized `buildChatBody` is displayed, including model/options/instructions.
The API key is sent only through the existing transport's authentication headers,
never added to the preview. Invalid/credential-bearing URLs are refused by the
shared analysis-settings validation also used by Relationship Analyzer.

`TagRecommendationSession` snapshots source identity/content/stat, model settings,
confirmed profile and inventory; it rechecks before dispatch and after completion.
Events invalidate consent/results immediately. The selected note alone is reread
at preparation, before sending and after the response. Cancellation, closing,
selection changes or stale dependencies abort waiting and suppress late UI updates.
One confirmation dispatches at most once. `requestUrl` may already have sent the
request when cancellation occurs: UI and a close notice warn that provider billing
may still apply. Network errors never automatically retry.

No source, prompt, response or recommendation is saved. Provider retention is a
separate policy. The only persistence remains explicit saving of taxonomy rules in
Veynrel's existing serialized settings owner.

## Reuse and next steps

- `prepareTagAnalysis` / `analyzeTags` accept content, a profile and observed tags,
  with an injected completion function. They have no Obsidian/file/settings owner
  and can later analyze an in-memory draft after the caller implements consent.
- Production uses `LanguageModelSettingsPort`, `buildChatBody`, `callOpenRouter`,
  `readSavedNote`, native file picker, existing taxonomy scanner/profile ownership,
  and the Relationship Analyzer consent/cancellation pattern.
- Deep Audit, Health findings, Relationship Analyzer behavior, manifest version,
  settings schema and published release are unchanged.

Future work: evaluate real model quality, support larger inventories with honest
coverage semantics, design user-reviewed policy exceptions/new categories, and
connect an in-memory Change Planner. No tag application, new atom creation, merge,
normalization, Markdown transaction/undo or background audit is implemented here.

## Validation

Synthetic fixtures in `tests/fixtures/tag-recommendations.json` cover theory with a
small practical example, a guide, programming/language-relative difficulty,
multiple topics, no applicable tag, justified new tag and insufficient context.
Contract/session tests add fabricated/ambiguous quotes, invalid/duplicate-key JSON,
new duplicates, strict/flexible roles, cache/profile/input limits, source/model/
profile/inventory races, cancellation, closing, double-clicks and exact transport
body checks. They exercise scripted outputs, **not real LLM classification quality**.

Native evidence and exact checks are recorded in
[tag-recommendations-native.md](tag-recommendations-native.md). Reproduce against
a built plugin in a fresh synthetic vault/profile:

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run audit:proposals
git diff --check
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-tags-fresh --taxonomy --tag-recommendations
```

The native driver injects a fake completion at the session boundary before any
analysis. It does not contact paid providers or use real vault content.
