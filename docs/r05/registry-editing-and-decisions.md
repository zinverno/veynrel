# R05.3: registry editing and durable organization decisions

Development-only changes after public 2.3.1, on unpublished 2.4.0. This does not
publish a release or change the single-release-after-R15 policy. Resume Batch
remains the separate mandatory [backlog](../roadmap/resume-batch.md).

## Editing connected rules

Workspace → Organization audit → Rules → Optional Markdown registry → explicitly
read/review/connect the selected file → Edit definitions with Review. Select one
existing definition or add one. Tags support allowed/excluded/deprecated and a
literal description; conventions support subject/value/description; categories
use the existing taxonomy validator. Existing tag spelling and category IDs are
read-only: remove/add are separate explicit decisions. Removal requires selecting
that exact definition and checking removal, followed by full Review and consent.
It does not remove tags/properties from notes; other category assignments can
still permit a removed tag. Review shows the complete remaining definitions.
There is no inferred vault-wide usage or semantic consequence analysis.

Only the JSON body inside one standalone, unindented, three-backtick
`veynrel-organization` fence is replaced. JSON is formatted with two-space indent
and the opening fence's LF/CRLF convention; all formatting differences appear in
the diff. YAML, prose, comments, headings, links and every character outside the
body remain exact. Definitions stay version 1. Allowed-unused and flashcards tags,
other categories and descriptions are preserved. No case folding, Unicode
normalization, synonyms or generated taxonomy. Equivalent key/set ordering alone
is a no-op and does not reserve a journal or write.

Multiple/ambiguous/nested fences, invalid/duplicate JSON keys, unknown fields,
unsupported versions and existing validator limits refuse. The document limit is
262,144 characters. BOM/UTF-8 byte mismatch refuses rather than reconstructing
unverifiable bytes. Affected open Markdown editors, including saved-looking split
and popout editors, refuse because a delayed save cannot be excluded. Close those
editors yourself after saving; Veynrel never closes or saves them for you.

The connected file remains the sole active source. Settings definitions remain
dormant. Missing, corrupt, changed or unvalidated registry state never silently
falls back. An edit never creates a missing registry or resets it to empty rules.
Settings-backed taxonomy editing is unchanged when no registry is selected.

## Write authority, journal and Undo

`RegistryPlan` reconstructs exactly one supported tag/convention/category change
and its unique fence-body patch. Hashes alone do not authorize arbitrary edits.
`edit_organization_registry` runs inside the existing `SafeApplyService` execution
lock with cross-family blockers and shared History. It is neither a tag insertion
nor a legacy link operation. Existing operation and local-note v1 records, Studio
and Recall journals are unchanged.

The typed version-1 subjournal lives at
`<vault-config>/plugins/<plugin-id>/consolidation-registry-operations/<id>/`.
`record.json` and `backup.json` contain verified prepared evidence and full
before/after copies **before** `Vault.process`. Never edit/delete damaged copies
as a way to authorize another write. Immutable `mark-<uuid>.json` receipts record
applied, undo intent and undone stages. A reservation cannot be replayed; no
automatic retry occurs. Unknown/damaged evidence blocks affected operations;
unidentifiable evidence blocks all families under the owner.

Preparation, confirmation and the synchronous process callback guard the selected
path, native TFile identity, ctime/mtime/size, full saved content, open editors and
active registry. Readback must match the exact after-content. Registry definitions
are invalidated, reread, validated and published through existing subscribers;
prepared local-note authority and model consent are invalidated. Failure after a
write is reported as a failure, even if History can inspect the saved content.

History and Undo are explicit. A missing applied marker with intact prepared
copies and exact saved after-content can be inspected after restart and offered
for a separately reviewed Undo. No Apply is replayed. Undo requires the same
connected registry, closed editors and unchanged saved result; a user edit or
registry switch disables it. Exact before-content is restored, checked and
published. If copies/receipts are damaged or the result changed, keep the original
journal evidence and compare its before/after against the current file manually.
Do not replace the current file blindly. This is not a general-purpose patch or
Undo engine.

## Stable identity and decisions

New identity contains version 2, proposal kind, literal tag prefix/type value,
selected scope, sorted/deduplicated exclusions and relevant confirmed rules.
For prefix advice, relevant category ID, name, purpose, multiplicity and
interpretation are included; sibling prefixes, unrelated categories and flat tag
assignments are not. For type advice, only that type's convention is included.
Changing relevant meaning, scope or exclusions creates a new authority. Counts,
examples, ordering, scan time and unrelated notes do not. Eligibility and the
existing minimum-evidence rules remain unchanged; no new recommendation algorithm
or model ranking is introduced.

The full canonical authority is persisted and compared exactly. `org2:` hashes
are compact display IDs, not authorization. Different kinds, literal case or
Unicode composition do not share authority. A partial/stale/cancelled audit never
resolves or deletes a stored decision.

- **Leave as is:** durable refusal of that authority.
- **Later:** durable deferred state, not refusal, acceptance or timed Finding
  snooze. It remains deferred until explicitly restored.
- **Return to consideration:** explicitly removes the selected saved decision.
- A rule is confirmed only through the existing rule Save or verified registry
  operation. Opening a Review does not record acceptance.

At most three active proposals appear in the main list. Other proposals are
available by disclosure (first 50 additional entries; narrow the scope beyond
that). Counts show current active/left-as-is/deferred proposals. Saved decisions
are shown by disclosure even when their authority is absent from this snapshot.

## Persistence and legacy compatibility

A valid preferences v1 object remains unchanged on passive load. The first
explicit new decision writes v2 with the same `registryPath`, unchanged legacy
`dismissed` array and a separate strictly validated `decisions` array. Save uses
the existing serialized compare-and-swap settings owner; no optimistic dismissal
is displayed, no conflicting saves are merged by guessing. A failed save retains
the old visible state. Unrelated settings remain intact.

Old opaque IDs cannot be reversed. They are preserved and recognized only when
the old algorithm, recomputed from this exact current snapshot, produces that ID.
An exact match offers explicit promotion to the new authority; the old ID remains
stored. After unrelated changes, an old unmatched hash may be impossible to
associate: it stays visible as an opaque legacy decision and is not transferred
to another suggestion. The user can explicitly remove a selected legacy record.

Legacy plus new decisions share the 200-entry limit. No eviction or truncation.
At capacity the UI explains the limit; restore an explicitly chosen entry to free
a slot. Duplicate/unknown/future/malformed settings fail closed and the original
raw settings value is preserved through unrelated saves. Recover such data from
a known-good backup or inspect it manually; this change does not silently repair,
reset or discard decisions.

## Scope and limits

No passive scanning, note mutation, model request, automatic organization, new
semantic map, bulk operation, Recall/Studio journal migration or paid API call.
Structural rules and synthetic tests do not establish semantic usefulness for
real vault owners. See [verification and combined R05 matrix](part3-verification.md)
for actual results and open native gates. R06 is not started.
