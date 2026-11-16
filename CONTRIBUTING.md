# Contributing to Veynrel

Start from current `main` in an isolated branch. Keep changes focused on one user-visible problem and explain which callers/data contracts they affect. Public documentation is English; private editorial materials do not belong in this repository.

## Build and test

Use Node.js 24 and the committed lockfile. The release preparation was exercised with Node 24.14.1 / npm 11.11.0; CI also checks npm 10.9.2. From a clean checkout:

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run lint
npm run audit:proposals
```

`lint` includes typecheck, production build and the existing Obsidian lint gate. Two intentional fetch advisories remain; do not increase their allowance or describe the repository as free of scanner findings. Do not update dependencies merely to pass a different tool version.

Focused examples:

```sh
npx vitest run releaseCompatibility.test.ts
npx vitest run studio/preservationChecks.test.ts studio/documentEnvelope.test.ts
```

Normal tests use local fixtures/mocks, without real provider credentials or live inference. Never paste keys into fixtures, logs, screenshots or issues.

## Module map

| Area | Source |
| --- | --- |
| Plugin lifecycle, legacy commands/settings | `main.ts`, `settings.ts` |
| Health and workspace | `health/`, `health/analyzers/local/` |
| Connections and supported changes | `semantic/`, `consolidation/` |
| Recall | `recall/` |
| Studio recipes, immutable Review, writes/history | `studio/` |
| Community recipes/catalog | `studio/community/`; published catalog is a separate repository |
| Model and embedding transport | `api.ts`, `embeddings/`, `deep/product/` |
| Localization | `i18n.ts` |

## Native testing in a disposable vault

Build first, then use the [isolated native runner](docs/native-testing.md). Its default is a private Xvfb + Openbox display; it does not open Obsidian on the working desktop. The runner creates a fresh disposable vault/profile, uses dynamic CDP ports, and cleans up its own processes. Linux, the installed Obsidian/Electron, Xvfb/Openbox, Python, xauth, xprop, D-Bus and ffmpeg are required. It does not install into your usual vault.

```sh
python scripts/native/run.py smoke
python scripts/native/run.py studio --timeout 240
python scripts/native/run.py recall
VEYNREL_R03_REVIEW_LABELS=1 python scripts/native/run.py studio
VEYNREL_NATIVE_EXCALIDRAW=/path/to/excalidraw-2.29.0-assets python scripts/native/run.py studio
python scripts/native/run.py community /path/to/local-catalog-fixture
```

The optional Excalidraw assets directory tests coexistence after R02 removal, not diagram generation. It must contain that version's `main.js`, `manifest.json`, `styles.css`; only the disposable vault receives a copy. The Community fixture is the separate catalog checkout used by its harness; the default runner disables its public-network branch. Read each harness before running it. Keep raw evidence outside Git and record exact bundle hashes. A controlled response proves workflow behavior, not model usefulness. Do not run live/paid evaluation tools as ordinary tests. Historical and attach-only harnesses are inventoried but are not automatically enrolled in this runner.

`--desktop` is an explicit visible comparison, not the default. Schedule it with the desktop owner. Xvfb does not verify GPU/driver behavior, the user's compositor, physical shortcuts/IME, keychain/portals or other platform-specific gates; retain the [real-desktop checklist](docs/native-testing.md#required-final-checks-on-the-real-desktop).

## Safety and UI expectations

Preserve consent, exact saved-source rereads, immutable Review, path collision checks, editor/popout guards, durable journals and fail-closed recovery. No retries for uncertain writes or model calls. Test meaningful edge cases and affected callers. Source Apply/Undo and separate-note creation have different recovery contracts. Archived diagram journals are ignored and preserved after R02; see [legacy data](docs/studio-diagram-removal.md).

UI uses Obsidian theme variables and scoped selectors. Do not override the user's theme or introduce global style resets. Check actual light/dark, EN/RU, focus/keyboard, split views and narrow desktop where affected; do not call desktop emulation mobile acceptance. New media must be native captures with synthetic fixtures and adjacent disclosure. Retain raw originals locally; annotations are separate derivatives.

Report PASS only for checks actually run on the stated build. Include failed attempts, NOT RUN coverage and evidence limits. AI-assisted contributions are welcome when the author reviews the code, evidence, licensing and claims; generated reports are not evidence by themselves.

## Recipes, reports and releases

Contribute public recipes to [veynrel-recipes](https://github.com/zinverno/veynrel-recipes), preserving published version bytes. For bugs, provide a small synthetic reproduction, versions and exact steps; never upload an entire personal vault. Use [Support](SUPPORT.md) and [Security](SECURITY.md).

Until separately authorized publication of 2.4.0, keep the public manifest at published **2.3.1**, omit unpublished versions from `versions.json`, and retain **2.4.0** in package/lock-root development metadata. Do not synchronize them in feature PRs. The existing CI runs `releaseCompatibility.test.ts` and `version-bump.test.ts` to guard this split. Read the [public/development version policy](docs/community-version-policy.md), including native build identification and the explicit release-only metadata command.

Separately authorized release preparation aligns package/lock-root/manifest/versions metadata, keeps plugin identity and compatibility, builds the three runtime files and records checksums/source SHA. `main.js` is build output, not a source commit. See the [publication checklist](docs/release-2.3.0-publish.md). A preparation PR or draft is not permission to merge, tag, publish or install. The [owner-approved roadmap policy](docs/roadmap/vault-assistant-plan.md#release-policy-and-acquisition-work) permits internal candidates and per-PR checks. Public 2.4.0 requires completed and accepted R06/R07 plus separate release acceptance; 2.5.0 requires R08–R15 and separate acceptance. Each publication needs its own explicit owner permission; public stable/beta/prerelease and Marketplace updates remain forbidden before the applicable gates and permission. Follow the [2.4.0 release checklist](docs/community-version-policy.md#release-acceptance-for-240). Community write-confirmation/document ownership remains open, and Resume Batch is required before 2.4.0 unless explicitly deferred by the owner. Keep auto-merge off.
