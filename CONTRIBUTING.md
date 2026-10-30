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
| Editable diagrams | `studio/diagram/` |
| Community recipes/catalog | `studio/community/`; published catalog is a separate repository |
| Model and embedding transport | `api.ts`, `embeddings/`, `deep/product/` |
| Localization | `i18n.ts` |

## Native testing in a disposable vault

Build first. Use a new `/tmp/veynrel-…-native-…` directory accepted by the harness; never point it at a personal vault. Existing harnesses create a fresh vault/profile, copy only runtime assets and synthetic fixtures, then launch native Obsidian. They require Linux, `/usr/bin/electron43`, `/usr/lib/obsidian/app.asar` and an available X11 display. They do not install into your usual vault.

```sh
node scripts/studio-source-preservation-native.mjs /tmp/veynrel-studio-native-my-check
node scripts/studio-excalidraw-native.mjs /tmp/veynrel-diagram-native-my-check /path/to/excalidraw-2.29.0-assets
COMMUNITY_PUBLIC=0 node scripts/studio-community-native.mjs /tmp/veynrel-community-native-my-check /path/to/local-catalog-fixture
```

The Excalidraw assets directory must contain that version's `main.js`, `manifest.json`, `styles.css`. The Community fixture is the separate catalog checkout used by its harness. Read each harness before running it; occupied ports and display focus can affect results. Model routes are synthetic loopback; catalog HTTP is separately controlled. Keep raw evidence outside Git and record the exact bundle hashes. A controlled response proves workflow behavior, not model usefulness. Do not run live/paid evaluation tools as ordinary tests.

## Safety and UI expectations

Preserve consent, exact saved-source rereads, immutable Review, path collision checks, editor/popout guards, durable journals and fail-closed recovery. No retries for uncertain writes or model calls. Test meaningful edge cases and affected callers. Source Apply/Undo, separate-note creation and diagram creation have different recovery contracts.

UI uses Obsidian theme variables and scoped selectors. Do not override the user's theme or introduce global style resets. Check actual light/dark, EN/RU, focus/keyboard, split views and narrow desktop where affected; do not call desktop emulation mobile acceptance. New media must be native captures with synthetic fixtures and adjacent disclosure. Retain raw originals locally; annotations are separate derivatives.

Report PASS only for checks actually run on the stated build. Include failed attempts, NOT RUN coverage and evidence limits. AI-assisted contributions are welcome when the author reviews the code, evidence, licensing and claims; generated reports are not evidence by themselves.

## Recipes, reports and releases

Contribute public recipes to [veynrel-recipes](https://github.com/zinverno/veynrel-recipes), preserving published version bytes. For bugs, provide a small synthetic reproduction, versions and exact steps; never upload an entire personal vault. Use [Support](SUPPORT.md) and [Security](SECURITY.md).

Release preparation updates package/lock-root/manifest/versions metadata consistently, keeps plugin identity and compatibility, builds the three runtime files and records checksums/source SHA. `main.js` is build output, not a source commit. See the [publication checklist](docs/release-2.3.0-publish.md). A preparation PR or draft is not permission to merge, tag, publish or install.
