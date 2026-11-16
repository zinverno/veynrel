# Public release metadata and development builds

## Recovery of published 2.3.1

Verified on 2026-11-16: default branch `main` at `ad817a3` advertised 2.4.0, while the latest stable [GitHub release](https://github.com/zinverno/veynrel/releases/tag/2.3.1) was 2.3.1, with source commit `cd9e8fc4048b4a17d0dc68993bd8b340d9da4720`. There was no corresponding public 2.4.0 release. This explains the reported Community Dashboard error `No release matches your manifest version`.

The [official submission requirements](https://docs.obsidian.md/plugins/releasing/submit-plugin) say the directory reads the default branch manifest and installs assets from the release with the matching tag. Restore the entire public manifest to the published 2.3.1 bytes, including its description: diagram generation exists in that release even though R02 removed it from development. Keep the plugin ID `ai-knowledge-hub`, minimum Obsidian `1.8.7` and mobile eligibility unchanged.

Remove only the future 2.4.0 entry from `versions.json`. It is not the direct cause of the reported error, but this compatibility index must not offer an unavailable download. The [official versions reference](https://docs.obsidian.md/Reference/Versions) describes fallback selection for older Obsidian versions; it is not a roadmap. All earlier entries remain intact.

## Development metadata before 2.4.0 publication authorization

| Metadata | Meaning during development |
| --- | --- |
| Root `manifest.json` | Published 2.3.1, byte-identical to its release asset |
| `versions.json` | Published compatibility entries only; no 2.4.0 |
| `package.json`, both lockfile root versions | Unpublished development target 2.4.0 |
| `main.js` built from a feature branch or `main` | Development code identified by source SHA and asset hashes |

Until the owner separately authorizes publication of 2.4.0, do not synchronize these versions in feature PRs, including branches created before this correction. Update those branches from corrected `main` before review and retain the public version pin in `releaseCompatibility.test.ts`. Existing CI runs that test and `version-bump.test.ts` on every PR; accidental restoration of 2.4.0 to the manifest or compatibility index fails the check. Do not update the assertions merely to make CI pass. CI detects mistakes; it does not prevent someone from bypassing checks or deliberately changing this policy.

The normal npm `version` hook leaves public metadata unchanged and stages nothing. `npm version` itself can create a commit/tag unless `--no-git-tag-version` is used; it is not needed for ordinary roadmap PRs. `npm run build` keeps the tracked manifest unchanged and builds the current source.

Only after the relevant scope and release gates below are accepted **and the owner separately authorizes that release**, release preparation may use `node version-bump.mjs --release` to copy the chosen package version into public metadata. The script accepts only Obsidian's `x.y.z` format and does not stage, commit, tag or publish. That future preparation must also review the public description, compatibility minimum, lockfile, CI pin, source commit and assets. Coordinate the public pointer with an available matching release; do not merge a future pointer in advance. The explicit flag is an accidental-write guard, not release authorization.

## Public release milestones

The [owner policy updated on 2026-11-16](roadmap/vault-assistant-plan.md#release-policy-and-acquisition-work) replaces the single release after R15: **2.4.0** is a full public release after completion and acceptance of R06 and R07 plus a separate release review; **2.5.0** follows R08–R15 and separate acceptance. Each needs its own explicit publication permission. No feature PR, internal candidate or policy update authorizes a public stable/beta/prerelease or Marketplace update. Per-PR tests, documentation, backups and migration checks continue.

After an authorized release, public metadata must describe that actually published version; later feature branches must retain that public pin until the next separately authorized release. This document does not change today's 2.3.1 public / 2.4.0 development values or relax their CI assertions.

## Release acceptance for 2.4.0

These are required evidence and approval gates, **not checks completed by this policy PR**. Repeat the applicable release checks for 2.5.0 against its own final source and scope.

- Complete and accept all of R06 and R07, retaining accepted R01–R05 behavior. A partial R06.1 result or green CI alone is insufficient. **Community write-confirmation/document ownership remains open**: see the [pinned #147 investigation](https://github.com/zinverno/veynrel/blob/3b48b3cd348ea87b0ced2124e7a7fb531f5ee64a/docs/r06/community-apply-attribution.md). Release readiness cannot be claimed while that gate is open; the policy does not fix or waive it.
- Implement and accept [Resume Batch](roadmap/resume-batch.md) before public 2.4.0 unless the owner explicitly authorizes deferral. It is not implicitly assigned to 2.5.0; its implementation requires a separate task.
- Prepare an up-to-date README, user/update guides and Community listing that describe the actual 2.4.0 scope, removed features and remaining limits. Distinguish current stable from unreleased capabilities; do not publish the listing changes early.
- Capture real native screenshots and short end-to-end demonstration videos of the final candidate. Identify source SHA and asset hashes, use synthetic or explicitly permitted data, disclose synthetic model responses, and keep private notes/keys out. Historical media is not evidence for a changed release build.
- Write release notes covering changes from the published stable, compatibility, known limitations, migration, recovery and supported Undo boundaries. Retain failed receipts and unresolved gates; do not present synthetic results as live-model quality or measured user benefit.
- Rebuild from the exact source and committed lockfile in a clean environment. Record tool versions, source SHA and SHA-256 for `main.js`, `styles.css` and `manifest.json`; compare the candidate with the reproduced files. Run the full suite, typecheck/build/lint, mutation audit, exact-head CI and applicable native/performance checks. Keep plugin identity, compatibility and existing safety contracts intact.
- Verify backups and migration of existing notes, Recall cards/schedules, settings and journals; test supported Apply/Undo, restart, conflicts and recovery on disposable vaults. Require exact restoration where Undo promises it. Document migration-aware rollback: replacing `main.js` alone is not a safe downgrade of a migrated Recall database.
- In real Obsidian, test a clean candidate installation and an upgrade from the actually published stable assets, checking persisted data and supported recovery. Use the isolated launcher; retain platform-specific gates that Xvfb cannot establish. A manual candidate install or unchanged displayed version does not prove the public Community updater works. After separately authorized publication, verify the actual Community listing, install and upgrade to the matching published assets before reporting delivery as verified. The production delivery check cannot be claimed from a pre-publication candidate test.

Acceptance of this evidence and permission to publish are separate owner decisions. Keep auto-merge off; every merge also needs its own authorization.

## Native tests and review artifacts

The runner copies the manifest it is given. A development build with the public manifest displays 2.3.1, including manifest-derived diagnostic reports. The existing CI `plugin-review-build` artifact is also a development build, not the stable release. Do not distribute it as 2.3.1 or overwrite the existing release assets.

Record `git rev-parse HEAD`, the package version, and `sha256sum main.js manifest.json styles.css` beside native evidence. Use disposable vaults/profiles and separate directories for stable and development assets. To verify installation of the actual stable release, pass its downloaded directory to `python scripts/native/run.py smoke /absolute/stable-assets`. A test of current `main` does not validate published 2.3.1; a same-number install does not prove the updater offered an upgrade. Historical native reports remain unchanged. See [native testing](native-testing.md).

## Dashboard recheck after a separately approved merge

An open draft PR cannot fix the directory's default-branch lookup. After the owner separately reviews and merges this correction, confirm that GitHub `main/manifest.json` reads 2.3.1 and the existing 2.3.1 assets remain available.

Sign in at [community.obsidian.md](https://community.obsidian.md), open **Plugins → Your entries → Veynrel**, then use **… → Check for new releases** to refresh the release lookup and **… → Request review** to force the review. Check the Manifest, Releases, Source code and Build verification results; confirm the version is 2.3.1 and the mismatch error has cleared. These menu names come from the [official management guide](https://docs.obsidian.md/community-directory/manage-entry). Do not create a new entry, select Publish, or publish/tag 2.4.0 for this recovery.

**Review branch → Run preview scan** can inspect this PR branch before merge, but a preview is not proof that the public listing recovered. Dashboard access, cache refresh and the installability result require the owner's recheck; local/GitHub checks do not establish that outcome. If another scanner error remains, retain its section and exact message for diagnosis rather than replacing the 2.3.1 assets.

## Recovery verification (2026-11-16)

- All 25 GitHub release records inspected; latest stable 2.3.1, no 2.4.0 release. Its five assets remain unchanged.
- Downloaded assets passed `SHA256SUMS`; `SOURCE_COMMIT` matches the 2.3.1 tag. A fresh tag checkout with `npm ci` and `npm run build` reproduced `main.js`, `manifest.json` and `styles.css` byte-for-byte.
- Corrected public `manifest.json` and `versions.json` match tag 2.3.1; development package/lockfile versions remain 2.4.0 and the lockfile is unchanged by this fix.
- Local checks: 5,366 tests in 208 files; typecheck, production build, Obsidian lint (the same two fetch advisories), proposal mutation audit 5/5 and native session-boundary checks 2/2 passed. New regression checks failed on the original metadata/hook before the fix.
- An intermediate run failed because `/tmp` filled; the isolated checkout was moved to disk and checks rerun. The stable-tag install needed a retry outside the sandbox after an esbuild `EPERM`. These infrastructure failures are not passing product evidence.
- Native Obsidian GUI/install/update checks and the authenticated Community Dashboard were not run. No merge, tag, release, listing publication or release-asset replacement was performed.

| Reproduced 2.3.1 asset | SHA-256 |
| --- | --- |
| `main.js` | `8df93c1a160b5c6ef322857fb5c3c3fae2e76c4ed905ecc1bd729da0a23a5740` |
| `manifest.json` | `a1c0f8f03004a3d19141ae0bae00f33dcc2a4e6c0e66135d99c0ab419e13a6a1` |
| `styles.css` | `664302cd8a51b2cf693f77df3e644e9d746c0279a8ea50408181679a6d5314fa` |
