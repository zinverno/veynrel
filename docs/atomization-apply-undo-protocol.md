# Atomization Apply & Undo v1: creation gate blocked

**Apply is not connected.** Native Obsidian 1.13.7 allows two concurrent `Vault.create()` calls to succeed for the same path and overwrite a competing note. This activates the requested stop condition: do not ship an executor that can overwrite another file. This PR supplies the reproducible gate, regression tests, evidence and a proposed protocol. It does **not** implement AtomizationPlan v2, a seventh journal, consent tickets, Apply, Undo or recovery.

PR [#97](https://github.com/zinverno/veynrel/pull/97) was verified merged into current `main`, `87da22d49f69de30a316759fb86da7ac8f8eb2ea`, before branch `feat/atomization-apply-undo-v1` was created. See the [native report and error log](atomization-create-gate-native.md).

## Why the existing creation path cannot be used

The installed public `Vault.create()` checks path/absence, then delegates a separate write. Its filesystem adapter writes without an exclusive-create option. Installed public `DataWriteOptions` exposes only `ctime` and `mtime`. Both source inspection and native behavior were checked; the decision rests on observed overwrites, not just an interpretation of declarations.

An already present file is refused. A file appearing after preview but before `create()` starts is also refused. Those successes do not cover a file appearing between the API's own absence check and write:

- Ten unmodified pairs of concurrent public `Vault.create()` calls both fulfilled; the second payload replaced the first in every observed pair.
- Pausing at the adapter boundary after native absence verification allowed a second public `Vault.create()` to finish. Resuming the first overwrote the second's exact content and still fulfilled.
- An independent disk writer in that same interval was also overwritten.

The barrier only delays dispatch to the original native writer; it does not falsify `exists`, change write options, or substitute a writer. The unmodified concurrent cases require no barrier. All targets are disposable synthetic notes.

`SafeApplyService.exclusive()` coordinates Veynrel executors within one plugin instance. It cannot lock Obsidian core actions, another plugin, another vault window/process or sync. Adding more absence checks, a reservation in a private journal, a random filename, creating a placeholder, or checking the hash afterwards does not close this window. Reading back the intended payload after overwriting someone else's file would even appear successful. `adapter.write()` is not an acceptable fallback. No claim of protection against independent processes is made.

The gate must be reopened only with a supported, demonstrated exclusive-create primitive, including the supported adapter/platform boundary. It must preserve a competitor's bytes when the competitor wins, return an unambiguous creation result, and fail safely when that guarantee is unavailable. Globally patching Obsidian's adapter or bypassing it with an undocumented desktop-only filesystem trick is not introduced here.

## Architecture review and intended integration points

| Existing owner | Finding and future integration |
|---|---|
| `atomizationPlan.ts` | v1 is explicitly `atomization_preview`, `readOnly: true`. Full sources and exact ranges are present. `atomIdentity()` is a session-local WeakMap counter; its numbers are **not durable file IDs**. |
| `obsidianAtomization.ts` | Reads inventory, MetadataCache, aliases, links, resolver and both Vault/adapter absence. This is an observation, not an atomic reservation. An unrelated empty note currently fails metadata completeness. |
| `bundleApply.ts` / `groupApply.ts` | Existing pattern: private one-use reviews, repeated checks, shared lock, two recovery copies, append-only receipts. They mutate an existing canonical note via `process`; that is not a new-file ownership protocol. |
| `bundleJournal.ts` / `groupJournal.ts` | Strict envelopes and duplicate verified recovery records are reusable patterns. Their reconstruction of structural evidence must not be copied into a validator that treats a reconstructed WeakMap token as genuine identity. |
| `safeApply.ts` | One execution owner and six-family snapshot/blocker checks. A future seventh family must join constructor, disposal, history, all executor blockers and single-file resolution paths, which also call individual blockers directly. |
| `obsidianSafeApply.ts` | Saved-note guards and `iterateAllLeaves` reject affected editors, including popouts. Future creation must also detect editors bound to a prospective path. Existing checks are not an OS lock. |
| `pairInspectorModal.ts` / planner view / history | Future final review and separate Undo review need independent consent, cancellation and generation guards; history must stay read-only on startup. |
| `main.ts`: `atomizeNote()` / `createAtomicNotes()` | Legacy command generates text through the configured model, calls `Vault.create`, then appends “Atomic notes” to the source. That behavior, `ai-atomize-note`, settings and concurrency handling remain unchanged. The new planner never delegates to it. |

No production source, old journal format, settings, manifest, version, release or frozen PR #92 corpus label changes in this PR. Added unit regressions demonstrate that reconstructed same-stat sources cannot validate a saved v1 plan, and that missing sections on an unrelated empty/nonempty note remain unknown dependency evidence.

## Proposed v2 contract, after the creation gate is solved

This section is design, not implemented behavior or acceptance evidence.

Generate a cryptographically random operation UUID **before** constructing the final Markdown. Bind it into the explicit comment `<!-- veynrel-atomization: <uuid> -->`, then compute SHA-256 over the full final text. Finally hash the immutable journal envelope. The UUID is not a hash of the body containing it, so no circular dependency exists. A changed plan revokes the review and obtains a new operation UUID. No marker enters extracted source ranges, and no second hidden record goes into Markdown.

Introduce an explicit `AtomizationPlan` version 2 with operation `atomization_create`. Never reinterpret v1 JSON. Preserve both full source notes, selected/context offsets and verbatim text, unchanged source remainder, target path, explicit title/source additions, dependency/analysis observations and all confirmations. Add the marker as a separately displayed and separately unchecked confirmation, exact final Markdown, SHA-256 for both sources and target, and operation ID. The exact placement/separator belongs to the previewed contract, including LF/CRLF and Unicode.

Keep runtime authority in private memory: actual TFile object references, session generation, original analysis object and one-use ticket. Keep durable evidence separately: canonical paths, ctime/mtime/byte size, full Markdown, SHA-256, metadata/resolver/dependency snapshots, absence observations and observed creation receipts. Serializing a WeakMap number may at most preserve a labelled diagnostic; it cannot authorize writes or survive as an identity assertion.

The journal validator must strictly validate an unknown serialized envelope independently: exact keys/version/operation, bounded strings/arrays, canonical paths, valid stats, byte lengths, SHA-256, analysis schema, source-relative ranges, native structural evidence, context ordering, unchanged sources, additions/marker/UUID consistency, exact reconstructed target body, confirmations and receipt transitions. It must not call `atomIdentity()` on synthetic TFiles to manufacture authority. Stored metadata is historical evidence; current metadata is reread separately. A plan from a prior process is never an Apply authorization.

A separate “Review and create atomic note” modal must show both full sources, selected/context ranges, target path, all additions, ownership marker and full literal target Markdown. State that semantic independence remains a user judgment. Closing, cancel, plan changes, source/cache/analysis changes and late asynchronous results revoke the private ticket. Preparing/opening that review creates no file, folder, journal or model request.

Before review, after consent, and immediately before creation, reread both saved sources and compare full text, live TFile identity and ctime/mtime/size. Rebuild the complete plan against current MetadataCache, resolver, known dependencies and original Relationship Analyzer result. Recheck normalized path/basename/aliases/link conflicts, existing parent identity, exact Vault/adapter absence, final target bytes and editors across all windows. Absence evidence must identify the check stage; it never substitutes for exclusive creation.

## Proposed journal, creation and ownership

Use a separate `atomization_create` envelope/directory. Before the first Markdown operation, persist and reread two complete immutable recovery copies, including both sources, complete v2 plan, exact target/marker, hashes, confirmations and absence evidence. Follow the existing conservative global/local corruption scopes. Do not alter six older formats.

Under the common execution lock, recheck all **seven** journal families after registration, all touched paths (both source pair paths and target), live sources/dependencies, parent and absence. Then call the proven exclusive creator once. Pin the actual returned TFile; reread its full content and verify path, identity, ctime/mtime/bytes, SHA-256, exactly one expected ownership marker and source-link resolution, with both originals unchanged. Only then persist and reread an `applied` receipt bound to the immutable record hash and actual creation observations. Never retry an ambiguous create.

Incomplete or damaged operations reserve touched paths; unidentified corrupt records block globally. Intact terminal receipts release execution reservations. Undo eligibility remains a separate live assessment, so a later edit does not permanently block unrelated new work.

The marker is an ownership hint, not sufficient evidence by itself. Even an exact path/body/marker match without a verified `applied` receipt is ambiguous. After restart, a journal records what was observed previously, not an eternal native TFile identity. A new runtime TFile must be pinned for that review and checked against durable evidence. If replacement cannot be distinguished adequately, automatic Undo must refuse; matching stats or reusing a WeakMap number cannot close that gap.

## Proposed Undo and recovery gate

Undo requires its own complete preview and consent. Verify both recovery copies and receipt consistency, both unchanged source notes, the exact target content/marker/path/stats, a current runtime identity, all seven-family blockers and no open affected editors. Reobserve incoming links, aliases/resolved/unresolved references and any new dependencies. Refuse edited, renamed, replaced or newly referenced atoms. Unknown dependency evidence is not absence evidence.

Write/read back `undo_intent` before requesting trash. Prefer public Obsidian trash. Its `system=true` API can fall back to local trash; a resolved promise alone must not be reported as successful Undo. Verify the observed target absence and retained recovery evidence before the `undone` receipt. System/local trash destinations, collision behavior, retained bytes and error cases need their own native acceptance. They have **not** been proven here. No source modification or restoration is part of Undo.

| SIGKILL checkpoint | Required restart behavior; all currently NOT RUN |
|---|---|
| Before journal preparation | No automatic work; a previous plan is not consent. |
| After first recovery copy | Preserve partial evidence; local reservation if safely identified, otherwise global/manual recovery. No create. |
| After second copy | Validate both copies; target absent means prepared, not permission to resume. |
| After last absence check, before creation | Fresh read-only inspection; no background create. |
| After creation, before `applied` | Existing target is ambiguous even with matching path/body/marker. Preserve it; no automatic trash/delete. |
| During `applied` write | Torn/conflicting receipts require manual recovery; never synthesize ownership from target text. |
| After `undo_intent` | Do not retry trash automatically. Inspect exact target and recovery evidence. |
| After trash, before `undone` | Inspect absence and trash evidence; an absent file alone does not prove which actor removed it. Preserve ambiguous state. |
| During `undone` write | Preserve torn receipt and backups; no automatic deletion or recreation. |

The requested create → SIGKILL/restart → history → separately confirmed Undo matrix, popout blockers, trash and seven-family corruption/interlock tests remain blocked with the executor. They must pass before a future feature PR claims Apply/Undo support. There is no new seventh-family journal on disk today.
