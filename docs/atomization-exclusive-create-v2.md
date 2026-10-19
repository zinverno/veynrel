# Atomization Exclusive Creation Gate v2

**Apply remains disconnected.** Linux exclusive creation preserves a file that wins the race before Veynrel opens it. The native gate also found a remaining vault-containment failure: moving the pinned parent directory into a second synthetic vault immediately before the exclusive open leaves an empty file there. The candidate refuses before writing the body, but it has already created an entry outside the intended vault. This is not sufficient to authorize Atomization Apply.

This is a capability experiment and a narrow empty-note planner fix. It introduces no Apply/Undo UI, ownership marker, journal, folder creation, background recovery or source mutation. PR #98's [original red regression](atomization-create-gate-native.md), its harness and evidence remain unchanged. [New native results, timings and error log](atomization-exclusive-native.md) distinguish the improved creation primitive from the unresolved gate.

## Isolated desktop capability

`consolidation/desktopExclusiveCreate.ts` is not imported by the production entrypoint or any planner/executor. Its callers are unit tests and a disposable native helper plugin. Inspection can return a candidate with `available: true` and **`applyReady: false`**; that is never consent or an execution capability for the ordinary user flow.

Inspection requires actual `Platform.isDesktopApp`, an `instanceof FileSystemAdapter` check, explicit local/unsynchronized environment evidence, Linux, a canonical nonsymlink vault root, and Btrfs (`statfs.type = 0x9123683e`). Unknown adapters, storage scope, network/synchronized environments, other operating systems and other filesystem types refuse. The normal default scope is `unknown`. No product setting or `isDesktopOnly` change is made.

Filesystem type cannot detect a sync client or prove that a user directory is unsynchronized. The synthetic harness supplies that environmental evidence because it owns the new fixture. A future product cannot simply hardcode the same assertion or infer it from Btrfs; unavailable evidence must continue to refuse. This PR claims no support for NFS, SMB, FUSE, ext4, tmpfs, Windows, macOS or mobile.

The module uses public adapter `getBasePath()` / `getFullPath()` and type-only Node imports. Actual Node loading is inside the desktop check; it never executes on mobile. Native renderer dynamic `import("node:fs")` failed, while desktop-guarded runtime `require` worked. This follows [Obsidian's mobile guidance](https://docs.obsidian.md/Plugins/Getting+started/Mobile+development); the installed public `obsidian.d.ts` declarations were also inspected. No global Vault/DataAdapter patch is a production implementation.

For a valid existing parent, the candidate:

1. Checks the existing atomization path rules and exact agreement between adapter full path and the vault-relative path.
2. Opens each directory component with `O_DIRECTORY | O_NOFOLLOW`, relative to the preceding pinned Linux descriptor via `/proc/self/fd`. Verifies root/parent device and inode, canonical paths and filesystem type.
3. Refuses observed case/NFKC filename collisions, then calls `fs.promises.open(..., "wx", 0o600)` once. No `exists` loop, random target, reservation lock, truncating writer or `adapter.write` fallback supplies exclusivity.
4. Checks the newly opened inode, parent and named entry before writing, writes only through that descriptor, syncs the file and parent, then reads back exact UTF-8 content and compares identity/stats. A separate `verify` repeats current checks after external writers have run.
5. Attempts to close every returned descriptor on success or error. Failure after exclusive open reports `mayHaveCreated: true` and preserves empty/partial evidence. It never retries, unlinks or repairs an ambiguous result.

Node documents `wx` as exclusive creation; existing POSIX symlinks also count as occupied. It warns that exclusivity may not work on network filesystems and requires explicit handle closure. Those documented limits motivate refusal and the descriptor checks; they do not establish Obsidian acceptance on untested filesystems. [Node 24 filesystem documentation](https://nodejs.org/docs/latest-v24.x/api/fs.html#file-system-flags).

The returned device/inode/size/ctime/mtime/birthtime and body are experimental readback evidence, **not a durable receipt or ownership proof**. Node `ctimeMs` is inode change time, not Obsidian's native creation timestamp. Neither those numbers nor session-local `atomIdentity()` tokens authorize recovery or Undo.

## What the gate proves and what blocks Apply

| Boundary | Result |
|---|---|
| Two public `Vault.create()` calls | Original red result: 10/10 pairs both succeeded and competing bytes were replaced. |
| Two exclusive calls at the identical path | 10/10 pairs had exactly one winner; its complete bytes survived. |
| Another process wins immediately before `wx` | `EEXIST`; competitor bytes unchanged. |
| Public Vault creator wins before `wx` | Refusal; competitor bytes unchanged. |
| Another writer modifies the created file later | Fresh verification refuses. Exclusive creation does not lock future writes. |
| Static symlinks/traversal, missing parent, access denial | Refusal without creation or foreign-file modification. |
| Parent replaced with an escaping symlink | The descriptor stays bound to the old directory; body write refuses. Empty evidence remains at the moved directory inside the vault. |
| Parent itself moved outside the vault before `wx` | **BLOCKED:** the pinned descriptor follows that directory; an empty entry appears in the second synthetic vault. |

Linux descriptors remain bound to the opened object even if its pathname changes. Pinning defeats a symlink substitution but does not freeze a directory's location. The native relocation test and unit regression demonstrate this distinction. More realpath/exists checks or Veynrel locks cannot make that final interval atomic. [Linux `open(2)`](https://man7.org/linux/man-pages/man2/open.2.html).

The no-overwrite guarantee covers the **exact directory entry** at exclusive open. Case/NFKC, basename, alias and dependency checks remain separate observations; no atomic portable name-namespace reservation is claimed. Independent writers can modify a successfully created inode or introduce later dependencies. A resolved create promise alone cannot become an applied receipt.

## Verified empty-note observation

Previously one unrelated empty note with cache `{}` blocked planning throughout the vault. The only production behavior change is a guarded exception in `readAtomizationObservation()`:

- Consider only a Markdown TFile with zero native size and a present cache lacking every public parsed-content field: sections, links, embeds, frontmatter links/properties/position, headings, lists, tags, blocks, footnotes, footnote references and reference links.
- Pin its TFile object, path, ctime/mtime/size and full cache serialization. Require both dependency maps and no outgoing resolved/unresolved entries for it.
- Compare adapter stat with the native snapshot, read the exact saved text, require `""`, and repeat native/cache/dependency and adapter-stat checks. Repeat disk and runtime checks after the asynchronous destination observation too.
- Record `emptyVerified: true` in the read-only observation. Do not write to MetadataCache or invent `sections: []`.

Native cache can contain stable private bookkeeping after restart (`{v:1}` was observed). That is accepted only with the same absent public fields and exact empty-byte proof; the code does not hardcode `v`. Null cache, nonempty/whitespace text, parsed properties/links, unknown dependencies, identity/stat/cache changes, read errors and late disk changes fail closed. Normal metadata-backed notes cause no extra Markdown reads. This is a fresh planning observation, not a persistent exemption or a cross-process source lock.

## Next Apply/Undo contract: prerequisites, not implementation

First resolve or explicitly redesign the demonstrated containment boundary and rerun this gate. Do not wire the current `applyReady: false` candidate to Apply. Also establish an enforceable supported-storage policy; testing Btrfs does not identify every unsynchronized user vault.

After those prerequisites, the [existing proposed Apply/Undo protocol](atomization-apply-undo-protocol.md) still applies: explicit v2 plan, UUID chosen before embedding its separately confirmed marker and hashing the complete body, private one-use consent, fresh validation of both full sources and analysis, all seven journal families under the shared lock, two verified recovery copies before creation, and separate Undo review. v1 JSON remains read-only and is never reinterpreted.

Creation must call the proven primitive once, then wait with a bounded timeout for actual TFile discovery and coherent MetadataCache. Reread exact bytes, SHA-256, native identity/stats, source-link resolution and unchanged sources; reobserve dependencies/editors and compare the filesystem evidence again before a durable receipt. Watcher timeout, source drift, later writer, close error or partial result means an ambiguous operation, not success or permission to delete. Do not force native detection by calling `Vault.create` after external creation.

Future journals need complete recoverable source/target texts, ranges/context, confirmed additions, versioned analysis, hashes, operation identity and receipts. They do **not** need duplicated megabytes of unrelated inventory. A compact observation commitment can hash a deterministic canonical serialization of paths/types/stats, metadata fingerprints, aliases, resolver observations and dependency maps. Runtime TFile identities stay in private memory. Full source structural evidence and relevant target/link conflicts stay explicit. Any digest must be recomputed from a **fresh complete scan** at each strict validation point; it cannot replace scanning, prove absence on its own or authorize a prior session's plan. SHA-256 and a versioned serialization would be required for durable commitments; v1 `stableHash` is not that contract. No digest/journal optimization is implemented here.

Crash after exclusive open may leave an empty file; crash after full write but before receipt remains ambiguous even if text and marker match. Preserve evidence and offer manual recovery without background create/delete/move. Ownership after restart, inode reuse/replacement, trash semantics and the full journal/SIGKILL matrix remain separate unproven gates. The new creator experiment does not solve them.
