# Stage 4 — beta packaging

Release branch `release/2.2.0-beta1` starts at the accepted cumulative #115:
`6503cdb86e0213dcc1b69dbb8b503fa2b70af5b2`. Included main:
`58456e09b735c37472cf194c2086f7f01f260ff3`. Latest stable: 2.1.0,
`6df435f1f1cd1f9421f908b816dcae02df1a4f9e`. No remote merge is part of this task.

## Distribution decision

2.2.0 is free at preparation time. The title is **Veynrel 2.2.0 — Beta 1**;
the draft uses `draft:true`, `prerelease:true`, `make_latest:false`, and the full
release source SHA. The numeric tag must match manifest.version exactly.
Plugin identity remains `ai-knowledge-hub` / Veynrel.

Only the beta branch raises minAppVersion to 1.13.7 and sets isDesktopOnly=true.
This conservatively limits distribution to the tested desktop generation; it
does not establish technical incompatibility with older versions/mobile, or
tested Windows/macOS support. Package/lock root versions and versions.json are
consistent; all historical compatibility entries and dependency bytes remain.

The default branch manifest stays 2.1.0, minAppVersion 1.8.7, isDesktopOnly=false.
GitHub prerelease alone is insufficient channel isolation: Obsidian's directory
uses the default-branch manifest and its matching release tag. The packaging PR
targets #115's integration branch only for CI and is **not** to be merged into
default branch as part of beta publication. Only cumulative #115 later enters
main. No independent merging/cherry-picking of #106–114.

## Scope and reproducible gates

Only distribution/version metadata, its existing compatibility test, docs and
a short mode in the existing native harness change. Two newly triggered
metadata-dependent settings advisories are individually reviewed in the existing
lint checker; see the beta addendum in obsidian-review-audit.md. Runtime source, CSS,
workflows, data formats and dependencies are untouched. The bundle imports
manifest in relationshipReport; any generated-byte difference must be compared
and accounted for rather than described as docs-only.

Required final gates: full suite; both typechecks/build/lint; proposal mutation
audit 5/5; installer regression and isolated preservation/rollback; cumulative
diff check. All three CI checks must complete on the release SHA, with PR merge
tree equal to HEAD. Downloaded CI, draft assets and local frozen files must match.
The frozen report records exact source/CI SHA, results and checksums, avoiding
a self-referential commit hash here. Until those gates finish this document is
a preparation contract, not a PASS claim.

Short native reproduction (new isolated artifact roots):

```sh
node scripts/review-flow-native.mjs NEW_ROOT FROZEN_BUILD release
node scripts/review-flow-native.mjs NEW_ROOT FROZEN_BUILD release PUBLISHED_210_BUILD
```

It uses the actual installer, list-first UI, rule/decision save and plugin
restart, consent/body equality, real loopback transport/parser/strict validator,
preflight, planner, separate review/Apply, list, History and separate Undo.
All Markdown hashes must equal the pre-run hashes after Undo. No paid/live or
embedding call, personal vault, TEST or user API key is used. The wider matrix
is historical evidence at #115, not rerun by this short packaging smoke.

## Event audit

Existing CI runs on pull_request and selected branch pushes; the new release
branch push alone does not publish anything. `release-provenance.yml` subscribes
only to release `published`, rebuilds and compares the three assets, then
attests them. It does not create a release or tag. No workflow is changed.
GitHub documents no created/edited/deleted workflow for drafts. Explicit draft
creation via the releases API does not call a git-ref creation endpoint; the
CLI also keeps its draft without its later publication call. Verify absence
of tag 2.2.0 before/after creation, draft flags/target, unchanged Latest/default
branch and no new provenance run. Authenticated draft downloads are not public
asset availability or post-publication provenance.

## Sources checked during preparation

- [Obsidian manifest](https://docs.obsidian.md/Reference/Manifest): x.y.z metadata.
- [Plugin release/directory](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin): assets and default-branch manifest/tag selection.
- [GitHub release management](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository): save draft versus publish.
- [Releases REST API](https://docs.github.com/en/rest/releases/releases#create-a-release): draft/prerelease/target/make_latest.
- [Release events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release): draft and published behavior.
- [CLI create](https://cli.github.com/manual/gh_release_create) and [implementation](https://github.com/cli/cli/blob/v2.100.0/pkg/cmd/release/create/create.go): explicit draft path, no implicit publication.

No BRAT integration, new feature, redesign or acceptance expansion is needed.
The remaining gate is a single explicit publication authorization after delivery.
