# Veynrel 1.8.0 maintainer release checklist

Preparation only. Do not run the release steps until Community Preview is accepted/understood, the PR is reviewed, and the PR is merged. This branch does not publish a tag or release.

## Before merge

- Submit `release/veynrel-1.8.0` at the exact final PR SHA to authenticated Community **Review branch**. Save the resulting SHA and findings. Expected: only `api.ts` streaming `fetch`, `no-restricted-globals`; local lint is not a hosted result.
- Confirm all three PR checks are green on that exact SHA. Review the [release notes](releases/1.8.0.md), [inventory](veynrel-rebrand-inventory.md) and [verification](veynrel-release-verification.md).
- Review and merge the PR separately. Do not publish the unmerged branch.

## After merge — execute manually

1. Update a clean checkout from the canonical plugin repository:

   ```sh
   git switch main
   git pull --ff-only origin main
   git status --porcelain
   git rev-parse HEAD
   ```

   Require empty status. Confirm the SHA is the reviewed merge, contains the final PR commit (or its reviewed squash equivalent), and main CI is green. Record this merge SHA. If intervening changes exist, review/test them before selecting the release commit.

2. Verify release metadata and build from that clean commit:

   ```sh
   npm ci
   npm test
   npm run build
   npm run typecheck
   npm run lint
   npm run audit:proposals
   git diff --check
   node -e 'const m=require("./manifest.json"),p=require("./package.json"),l=require("./package-lock.json"),v=require("./versions.json"); require("node:assert/strict").ok(m.id==="ai-knowledge-hub" && m.name==="Veynrel" && [m.version,p.version,l.version,l.packages[""].version].every(x=>x==="1.8.0") && m.minAppVersion==="1.8.7" && v["1.8.0"]==="1.8.7" && m.fundingUrl==="https://boosty.to/veynrel" && m.isDesktopOnly===false)'
   ```

   Expected lint: zero errors and the single intentional streaming advisory. Confirm status is still clean. Repeat the npm 10.9.2/11.11.0 scanner installs in disposable clones if the lockfile changed after Preview. Never regenerate this lock with npm 11; use the existing npm 10 repair convention for deliberate dependency updates.

3. Use the repository's **unprefixed** tag convention, matching the manifest exactly (`1.8.0`, not `v1.8.0`). Confirm no local or remote tag with that name already exists. At the verified merge SHA:

   ```sh
   git tag -a 1.8.0 -m "Veynrel 1.8.0"
   git push origin refs/tags/1.8.0
   ```

4. Build from the exact tag in a fresh directory:

   ```sh
   git clone --branch 1.8.0 --single-branch https://github.com/zinverno/veynrel.git veynrel-1.8.0-tag
   cd veynrel-1.8.0-tag
   git rev-parse 'HEAD^{commit}'
   npm ci
   npm test
   npm run lint:obsidian
   sha256sum main.js manifest.json styles.css
   ```

   Confirm this commit equals the recorded release merge SHA. Keep the hashes with the release record. The CI artifact also includes development build metadata; upload only the three plugin assets below.

5. Create a draft release using the existing tag and public notes, uploading exactly `main.js`, `manifest.json`, and `styles.css` from this tag checkout:

   ```sh
   gh release create 1.8.0 main.js manifest.json styles.css --repo zinverno/veynrel --verify-tag --draft --title "Veynrel 1.8.0" --notes-file docs/releases/1.8.0.md
   ```

   Review the draft and its three manually attached assets. GitHub's automatically generated source archives are separate. Do not attach source maps, dependency trees, local data, tokens, test fixtures or `.esbuild/meta.json`.

6. Publish the reviewed draft manually. The `Attest published plugin assets` workflow runs on `release.published`; it builds the tag, tests/lints it, downloads these three published assets, compares each with `cmp`, and attests them. It cannot fix a mismatched upload. Require a green workflow and inspect its provenance before treating publication as verified.

7. Independently download to an empty directory and compare against the tag build:

   ```sh
   gh release download 1.8.0 --repo zinverno/veynrel --dir published --pattern main.js --pattern manifest.json --pattern styles.css
   for asset in main.js manifest.json styles.css; do cmp "$asset" "published/$asset"; done
   gh attestation verify main.js --repo zinverno/veynrel
   gh attestation verify manifest.json --repo zinverno/veynrel
   gh attestation verify styles.css --repo zinverno/veynrel
   ```

8. Check Community discovery/update metadata: plugin ID stays `ai-knowledge-hub`, repository is `zinverno/veynrel`, minimum app version stays `1.8.7`, and the update resolves release `1.8.0`. Update the Directory display name/description and approved icon separately if managed in the authenticated account UI. Do not create a second plugin entry.
9. Ensure the manifest support link and GitHub sponsor button point to `https://boosty.to/veynrel`. If the Community Directory profile has a separately managed funding field, set it to that same URL manually. No authenticated Directory automation is part of this preparation.
10. In an existing installation, use the normal update action and verify Veynrel loads in `.obsidian/plugins/ai-knowledge-hub/` with enabled state, hotkeys, provider/settings, semantic search and optional Companion intact. Confirm no reinstall or brand-triggered reindex. Record the actual hosted/update result separately from the pre-release native smoke tests.

Approved visual identity and refreshed demo artwork can follow separately; see [visual follow-up](veynrel-visual-rebrand.md).
