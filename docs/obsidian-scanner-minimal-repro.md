# Minimal type-resolution probe

Use the [compact fixture archive](extraction-evidence/minimal-type-resolution.tar.gz), rather than creating a third public repository. It contains a tiny plugin, pinned direct development dependencies, lockfile, manifest, license, TypeScript and ESLint configuration. Nothing depends on Vault Audit AI or Companion source. The manifest retains the existing plugin ID for a potential account Preview; this fixture must never be published as a release.

## Versions and configuration

Executed with Node 24.14.1 / npm 11.11.0. Direct versions: ESLint 9.39.5, `eslint-plugin-obsidianmd` 0.4.2, Obsidian 1.12.3, TypeScript 5.3.3, esbuild 0.19.11. Transitive versions are pinned in the included lockfile.

```ts
import { Notice, Plugin } from "obsidian";
export default class ResolutionProbe extends Plugin {
  onload(): void {
    this.addCommand({
      id: "show-active-note",
      name: "Show active note",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) new Notice(file.basename);
      },
    });
  }
}
```

```json
{"compilerOptions":{"target":"ES2020","module":"ESNext","moduleResolution":"node","strict":true,"skipLibCheck":true,"noEmit":true,"lib":["DOM","ES2020"]},"include":["main.ts"]}
```

```js
import obsidianmd from 'eslint-plugin-obsidianmd';
export default [
  ...obsidianmd.configs.recommended,
  { languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } } },
];
```

## Exact local experiment

In a disposable directory, extract the archive, enter `minimal-type-resolution`, and run:

```sh
npm ci --ignore-scripts
npm run build
node node_modules/eslint/bin/eslint.js main.ts --format json > healthy.json
mv node_modules/obsidian ../held-obsidian-declarations
node node_modules/eslint/bin/eslint.js main.ts --format json > missing.json
mv ../held-obsidian-declarations node_modules/obsidian
node node_modules/eslint/bin/eslint.js main.ts --format json > restored.json
```

The middle ESLint command intentionally exits 1; always restore the directory even if interrupted. Do not run this experiment in a real development install. The fixture was initially locked with `npm install --ignore-scripts`; subsequent reproduction uses `npm ci`.

Actual results: healthy **0**, missing **6 errors** (3 unsafe calls, 1 unsafe assignment, 2 unsafe member accesses), restored **0**. Compare `(relative file, ruleId, line, column, endLine, endColumn, message, severity)` multisets, including repeated same-line findings, not just aggregate totals. Raw results: [healthy](extraction-evidence/minimal-healthy.json), [missing](extraction-evidence/minimal-missing-types.json), [restored](extraction-evidence/minimal-restored.json). Build succeeds with declarations installed. The current documented hosted configuration disables unsafe-type rules, so this deliberately uses the **official recommended local preset** to expose the type-resolution delta.

## Hosted comparison plan — not yet executed

Keep the archive attached to the supplemental #182 evidence first. If maintainers need a hosted example, put only its contents in a temporary branch of the existing plugin repository and record its exact SHA; leave `main`, release tags and published assets untouched. No new public reproduction repository is needed.

The **one account-holder action** is to select **Review branch** on [the plugin account page](https://community.obsidian.md/account/plugins/ai-knowledge-hub), submit that fixture ref/SHA, and save the result including install/build log if offered. The [official FAQ](https://docs.obsidian.md/community-directory/faq) describes this flow; no documented unauthenticated preview-trigger API was found. This task does not submit a new authenticated Preview.

Save the Preview date/ref/full SHA, scanner version if exposed, package-manager/install outcome, and file/rule/location/message list. Compare with both fixture outputs above. A zero hosted result means the tiny healthy fixture does **not** reproduce the current project installation failure; it must not be relabeled a reproduction. To test that separate installation hypothesis, attach the existing baseline npm 10 failure and ask for the real hosted install environment before adding dependencies to the fixture.

The existing September 15 `main` Preview at **1a978e3046a8032db8afbe421c9203d0caedd095** remains distinct from this **unexecuted tiny Preview** and the published 1.7.0 scorecard.
