# R05.2 — safe local tagging and selected broken-link repair

Unpublished development only. This is not a Marketplace update or completion of
all R05. [R05.1](local-link-actions.md) and its old operations remain available.
The [implementation audit](part2-audit.md) describes the reused owners.

## Tag one selected note

Workspace Home and Organization Audit offer **Tag a selected note**. Choose a
real saved Markdown file by full path. This is a one-note action, even when an
audit covers a folder or the entire vault. Audit exclusions constrain its picker;
opening this route neither scans the vault nor writes notes.

Choose an observed tag, an explicitly allowed definition (including unused ones),
or a manually entered candidate. Reading the whole-vault tag inventory is a
separate explicit local metadata action. Inventory state/counts and origin are
shown; a prefix alone is not offered as an allowed tag. The list is capped at 500;
a known valid tag can also be entered explicitly. No semantic suitability is
inferred. Case-insensitive comparison follows [Obsidian's documented tag behavior](https://obsidian.md/help/Editing%2Band%2Bformatting/Tags),
while the chosen spelling is retained.

Choose a native plain paragraph. Review shows the complete saved before/after
and diff. The only patch is ` #chosen/tag` at that paragraph's end. YAML is never
written or reserialized. A separate confirmation authorizes the one write.

This conservative subset accepts Unicode letters/marks/numbers, `_`, `-` and
nonempty `/` segments (not a purely numeric tag). It refuses `flashcards/...`,
Flashcards sections and tags excluded/deprecated by the connected definitions,
including manual candidates. Changing such rules is a separate action, not an
implicit override. Similar spellings are never merged. A lexical occurrence can
cause a conservative refusal even when it is not an active tag.

Simple unquoted scalar frontmatter and an indented `tags` list can be inspected
without changing their bytes. Flow arrays, quotes, aliases, anchors, folded
scalars, duplicate keys and other ambiguous YAML are refused. Missing metadata
cannot establish absence. Native inline tags, parsed supported YAML tags and the
full saved source are checked. Rich code/comment/HTML constructs are deliberately
refused rather than guessing a safe location.

## Repair one current wiki-link

In a **broken-link Finding**, choose **Review a repair**. The Finding identifies
the source, not a replace command. Preparation rereads that source and lists the
current unresolved native cache occurrences with offsets and nearby text.
Select one occurrence and an existing target by full vault-relative path.

The accepted token is a simple `[[Missing]]`. Aliases, embeds, heading/block
references, escapes and ambiguous/code constructs are refused intact. The exact
native offset must still contain that exact token. It must remain unresolved,
and the new full-path link must resolve to the selected `TFile`. Equal basenames
in other folders are distinct choices. Only one token is replaced; no global
regular-expression replacement or `add_link` substitution is used.

Review presents the full Markdown and diff. Separate confirmation precedes the
write. A successful write does **not** mark the Finding resolved. An explicit
subsequent Health check must confirm actual link resolution; other unresolved
occurrences may remain.

## Authority, freshness and editor boundaries

Explicit selection chooses the candidate; confirmed rules constrain execution.
Observed tags are evidence of use, not required classifications. The connected
Markdown registry is the only active definitions source: its full saved contents
are parsed and pinned, with no fallback to a dormant settings profile on error.
A registry/settings change invalidates a prepared plan. Neither action edits
rules or dismissals. Registry editing and stable R04 dismissal IDs remain R05.3.

Each source is bounded to 200,000 characters / 800,000 UTF-8 bytes. The native
adapter checks `TFile` identity, path, ctime/mtime/size, full saved contents,
applicable definitions and native ranges/resolution. It repeats these checks
after backup IO and inside the synchronous `Vault.process` callback. The callback
requires exact current text; readback must match the expected result and size.

All affected open editors, including split/popout and equal-to-disk buffers,
block execution. Public Obsidian APIs cannot lock delayed saves. Veynrel does not
close or save those editors. BOM/read-byte mismatches are refused before a
journal is created; CRLF and Unicode are preserved by supported exact splices.
The first development native attempt also observed Obsidian converting a CRLF
fixture to LF when an editor was opened **after successful Undo**; that host
write correctly revoked the old journal's current-state classification.

## Journal, History, Undo and interruption

The existing plugin-owned `SafeApplyService` supplies the common exclusive lock,
blockers, lifetime and History. New `add_inline_tag` and `repair_wikilink` records
use an independent **typed family**, not an independent executor:

`<configDir>/plugins/ai-knowledge-hub/consolidation-local-note-operations/<id>/`

Its family format is version 1; this is distinct from the unchanged
`consolidation-operations` v1 format. Each new record reconstructs its specific
allowed transformation; correct hashes alone do not authorize arbitrary text.
`record.json` and `backup.json` contain full before/after evidence and are read
back before dispatch. UUID stage files are immutable. The deterministic prepared
ID reserves the attempt durably; review tickets are consumed once, including
failure/cancellation. No startup or failure path repeats Apply automatically.

History reads and classifies saved state. Intact evidence plus the exact unchanged
applied source permits a new, separately confirmed Undo, including a write that
reached disk before its applied marker. Undo uses `Vault.process`, checks the
same identity and exact saved after text, and restores the original bytes. User
edits or open editors revoke automatic Undo. Terminal receipts release reservations
without pretending that a later edit is still undoable.

Incomplete/damaged copies, inconsistent markers, prepared-but-unwritten attempts
and an interrupted terminal Undo marker stay blocked. This bounded family does
not offer an automatic journal repair/replay or a release-reservation button.
Preserve the whole operation directory and vault backup; inspect before/after
and current files for **manual recovery**. Do not delete damaged evidence merely
to make a retry possible. Unknown journal structure blocks conservatively.

There is no model request, price estimate, automatic tagging, mass repair,
new Recall/FSRS system or general-purpose patch engine. [Resume Batch](../roadmap/resume-batch.md)
is recorded only as a deferred pre-release requirement.
