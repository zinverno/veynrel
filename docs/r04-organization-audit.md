# Advisory organization audit (R04, development)

This feature belongs to the unpublished development branch (`2.4.0`). Public
stable `2.3.1` does not contain R04. Publication remains gated on acceptance of
R01–R15. No release or migration of note data is part of this change.

## Start with local observations

Open Workspace or Health and choose **Organization audit**. The existing taxonomy
surface also remains reachable from Tools. Choose the whole vault (empty folder
field) or a vault-relative folder, including its descendants. Add excluded paths
as needed, then explicitly run the audit. Cancel remains available during work.
The scope shown here belongs to this audit; it does not narrow older global Health
operations. No profile, provider, key or methodology is required.

The audit reuses `scanTaxonomy`, Obsidian's Markdown enumeration/metadata cache,
`getAllTags`, the existing exclusion predicate and Workspace's separator-aware
scope check. It reads no note bodies and builds no persistent index. It reports
folders, literal tag prefixes/counts, cached YAML property names and short string
`type` values. Examples link to existing notes. Earlier cached local Health
findings may appear in a disclosure, explicitly labelled as earlier findings;
opening this surface does not rerun Health.

A tagless diary, an unconventional folder name and an empty vault are valid. No
organization score, semantic duplicate claim, inferred synonym or invented tag is
produced. At most three suggestions reuse an observed prefix or type occurring in
at least three notes. These are eligibility heuristics, not confidence estimates
or standards for organizing a vault. `flashcards/...` is not proposed as a general
knowledge category. A declared excluded/deprecated descendant suppresses a broad
reuse suggestion for that prefix.

Each suggestion identifies its literal evidence, denominator, examples, possible
benefit, unknown meaning and origin (hypothesis or confirmed rule). **Leave as is**
persists a bounded dismissal for that unchanged observation/scope/rule context.
A prefix can become a draft in the existing profile editor; it becomes a rule only
after its separate Review → Save. No audit automatically saves a profile or edits
Markdown. When evidence is insufficient, keeping the current organization is the
normal result.

## Snapshot and uncertainty

- `complete`: all enumerated, non-excluded notes were considered and their cache
  entries were available within supported bounds. This means cache coverage, not
  proof that every cache entry matches the saved file.
- `partial`: unavailable/malformed metadata, unsupported property values or a
  processing limit prevented full coverage. No structural hypotheses are offered.
- `stale`: a vault or metadata event invalidated the result, or scope/exclusions or
  the active rules changed. Rescan is explicit, never automatic.
- `cancelled`: interrupted work, including its counts, is labelled incomplete.
- `failed`: the selected folder no longer exists or could not be audited. It is not
  presented as an empty, healthy area.

Every snapshot records scope, exclusions, examined/excluded/unknown/pending counts,
start/end time, source path/creation identity/mtime/size, a deterministic revision
identifier and reasons for limitations. Source details remain session-only.
Obsidian's public cache API does not prove saved-file freshness; therefore
`metadataFreshness` always remains `unverified`, with a visible explanation.
Cached absence of a tag/property is not proof of its absence in Markdown. Events
are a conservative invalidation mechanism, not a substitute for that distinction.

Processing yields at bounded batches. The organization pass stops after 20,000
scoped files; existing tag limits remain (20,000 distinct tags, 10,000 tags per
note, 512-character tokens, 32 levels). Each observation group holds at most 5,000
values; examples are limited to five per value and display pages to 50 rows.
Only property names and short string `type` values are retained. No semantic
analysis, embeddings or body-text corpus is created.

## Rules and one active source

Precedence is explicit settings/exclusions → confirmed settings profile **or**
selected validated registry → cached observations → unconfirmed suggestions.
Repeating an audit cannot replace confirmed rules.

The existing `tagTaxonomyProfile` v1 format and editor remain supported. Optionally
open **Rules → Optional Markdown registry**, select a vault-relative `.md` file,
read it, review the exact contents and confirm connection. Missing, invalid,
unsupported-version and concurrently changed files have distinct errors. Failed
reads never overwrite the file. A selected registry is the sole active rule
source: the old profile stays dormant and its editor is disabled. An invalid,
changed or not-yet-loaded registry does not silently fall back to that profile.
Explicit disconnection reactivates the unchanged settings profile and leaves the
file untouched. After restart, selected definitions must be read explicitly again;
passive opening never reads a file. Rename/delete/modify invalidates loaded rules.

To create a registry, review/edit the complete new document, preview it, then
confirm creation. Creation does not silently connect it. R04 never updates an
existing Markdown file, even if it is a registry: edit it in Obsidian, then read
and review again. This deliberately avoids a second editable copy and an
unreviewed merge algorithm. The destination must not already exist; folders must
already exist. A race or save failure is reported, and the destination must be
inspected before retrying. If a file changes during connection persistence, the
selected path can remain saved but its definitions remain unavailable until
reread; there is no automatic fallback or overwrite.

The Markdown document contains exactly one `veynrel-organization` JSON fence:

````markdown
---
veynrel-service: organization-registry
---

# Organization rules

User-authored explanations are preserved verbatim.

```veynrel-organization
{
  "version": 1,
  "profile": {"version": 1, "categories": []},
  "tags": [
    {"tag": "topic/rare", "state": "allowed", "description": "Reserved for future use"},
    {"tag": "role/old", "state": "deprecated", "description": "Kept as history"}
  ],
  "conventions": [
    {"subject": "folder", "value": "!My own order", "description": "A deliberate user convention"}
  ]
}
```
````

`profile` uses the unchanged strict v1 schema. `tags` accepts literal `allowed`,
`excluded` and `deprecated` declarations (maximum 1,000). `conventions` accepts
advisory `folder`, `property` or `type` definitions (maximum 100); they are never
an enforcement mechanism. Text is preserved without case folding or synonym
inference. The document is bounded to 262,144 UTF-16 code units, duplicate JSON
keys are rejected, unknown fields/versions are rejected, and original Markdown
prose is not normalized. New documents must retain the service frontmatter shown
above. An explicitly connected existing file may have other surrounding prose.

Tag states remain distinct: observed, explicitly allowed but not observed in this
snapshot, unconfirmed candidate, unknown, and excluded/deprecated by the user.
Unused allowed tags are never deleted. A declared status takes precedence over an
observed tag; prefix declarations do not invent every possible unused descendant.
`flashcards/...` segments keep their literal meaning.

Only optional preferences `{version: 1, registryPath, dismissed}` are added to
plugin settings. Dismissals are bounded at 200 and never silently evicted; reaching
the limit is an explicit error. The existing serialized settings owner performs
compare-and-swap, cancellation and concurrent-update checks. No full snapshot,
file content, inventory or duplicate rule copy is persisted. There is no change to
Recall databases, Studio journals, versions or dependencies.

## Exclusions and privacy

Existing default exclusions cover hidden/configuration directories, backups,
templates, `node_modules` and Veynrel internal paths. Additional exclusions apply
only to this audit. The selected registry path is excluded. Files explicitly
marked `veynrel-service: organization-registry`, `instructions` or `prompt` are
excluded when that marker is available in metadata. A missing cache cannot prove
a service marker; it is counted as unknown, never treated as knowledge evidence.
Unmarked prompt/instruction files must be explicitly excluded by path; R04 does
not guess their meaning from prose. Excluded/unknown/pending counts are visible.

No local audit request reaches a model. Existing Tag Recommendations v1 remains
available for one explicitly selected saved note with a confirmed settings
profile, complete global inventory, full payload review, provider configuration,
consent, source freshness and response validation. Folder/partial inventories
cannot be substituted for its global contract. While a registry is selected,
Tag Recommendations v1 is unavailable: its current payload cannot represent the
additional file-backed tag/convention policies. R04 does not bypass that contract
or introduce a whole-vault classifier. Connecting a registry invalidates earlier
prepared AI consent even if its nested profile happens to match the old one.

## Acceptance and remaining scope

See [implementation audit](r04/implementation-audit.md) and the separate
[verification report](r04/verification.md) for actual tests, receipts and limits.
Synthetic fixtures test contracts and UI behavior, not usefulness to real users.
R05 owns specific safe note changes; R04 does not apply tags, rewrite YAML, move
folders or rename notes. GPU/compositor/IME and Obsidian custom-frame behavior
require an independently authorized real-display gate; Xvfb does not prove them.
