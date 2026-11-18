# Veynrel 2.4.0 — release acceptance and publishing checklist

## Distribution invariants

- [ ] GitHub release tag is exactly `2.4.0` and equals `manifest.json.version` in the tagged source.
- [ ] The release attaches the actual three files from a clean build of **that tag**: `main.js`, `manifest.json`, `styles.css`.
- [ ] GitHub's `release-provenance.yml` attestation completes: build output equals published asset bytes.
- [ ] Only switch `main/manifest.json` from published 2.3.1 to 2.4.0 after a matching 2.4.0 GitHub Release is available, to avoid another Community download mismatch.
- [x] README first image references existing `assets/showcase/2.3.0/hero.png`. This is the user's social-preview artwork; the caption `Editable diagrams` is historic, so ideally update the image separately before public launch.
- [x] GitHub repository About description no longer promises Studio/diagrams as current features.

## Scope and safety decisions

- [x] Owner moved the early release ahead of R07. A dedicated R07 PR is planned for 2.5.0.
- [x] Resume Batch deferred to a separate unscheduled PR. Cancellation stops future work and completed operations retain their own recovery rules.
- [ ] Community confirmation/document ownership is resolved **or** it is demonstrated unreachable with Studio/Community disabled, and residual risk is explicitly accepted for this release.
- [ ] Historical `e.isShown`, cold 10k and model-quality limitations are disclosed as applicable, not renamed PASS.
- [ ] Define minimum Obsidian version from real supported APIs and smoke evidence. If increased, add 2.4.0 to `versions.json` with a tested minimum so older clients can fall back to 2.3.1.
- [ ] Set platform eligibility honestly; physical mobile and screen-reader support have not been demonstrated.

## Quality and migration

- [x] Update release compatibility pin/tests intentionally as part of authorized 2.4.0 preparation, not to suppress accidental changes.
- [ ] Repeat full test/typecheck/build/lint/mutation/CI at the final source and release tag.
- [ ] Clean install and upgrade from **actual published 2.3.1 assets** on disposable vaults.
- [ ] Confirm settings, Recall history/queue, data.json, indexes, local recipes, journals, supported Apply/Undo, split/popout and controlled rollback.
- [ ] Capture current synthetic native screenshots and demos from the release commit, remove sensitive paths/keys.
- [ ] Review README, release notes, installation, provider consent and no-key experience.
- [ ] Confirm both remaining fetch warnings are accurately documented and no scanner **Errors** remain.

## Publishing

1. Create a release-candidate branch from current `main`, not old PR SHAs. Commit README, release notes, appropriate manifest, versions and compatibility updates.
2. Test cleanly; open a focused release PR. Preview that branch with **Community Dashboard → Review branch → Run preview scan**.
3. After approval, produce the tag `2.4.0` on a clean verified release commit and publish GitHub Release with three matching assets. Wait for `Attest published plugin assets` to pass.
4. Coordinate merging the release commit into `main` so manifest and tag match; avoid a window where `main` points to an unavailable version.
5. In Community Dashboard → Plugins → Your entries → Veynrel → `…` → **Check for new releases**, then **Request review**. Confirm Manifest, Releases, Source code and Build verification.
6. Verify actual install/upgrade through Obsidian Community Plugins. Do not call publication complete before that check succeeds.

The source PR stays in Draft with auto-merge off. GitHub repository access and the About update were verified. The authenticated four-section Dashboard preview, acceptance of the exact commit and residual risk, tag build, provenance and public delivery each require their own receipt. Record these on the release PR.

For an upgrade, retain a second copy of the migrated vault before restoring the full pre-upgrade snapshot. A binary-only downgrade cannot read the newer Recall format.
