import { ESLint } from 'eslint';
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';

// Keep every warning visible. Unlike a numeric warning budget, this rejects a
// new warning even when an unrelated accepted warning disappears.
// Rationale for each retained advisory: docs/obsidian-review-audit.md.
const reviewed = new Map([
  ['api.ts:no-restricted-globals', 1], // requestUrl cannot stream SSE.
  ['settings.ts:obsidianmd/settings-tab/prefer-setting-definitions', 1],
  ['companionSync/proposalTypes.ts:obsidianmd/hardcoded-config-path', 2],
]);
const eslint = new ESLint();
const results = await eslint.lintFiles('.');
console.log((await eslint.loadFormatter('stylish')).format(results));
let failed = false;
for (const result of results) {
  const file = relative(process.cwd(), result.filePath).replaceAll('\\', '/');
  for (const message of result.messages) {
    const key = `${file}:${message.ruleId}`;
    const remaining = reviewed.get(key) ?? 0;
    if (message.severity === 2 || remaining === 0) failed = true;
    else reviewed.set(key, remaining - 1);
  }
}
// The production build supplies deterministic membership, including modules
// reached across package boundaries. Never silently skip bundled TypeScript.
const metadata = JSON.parse(await readFile('.esbuild/meta.json', 'utf8'));
const checked = new Set(results.map(({ filePath }) => relative(process.cwd(), filePath).replaceAll('\\', '/')));
for (const [path, { bytesInOutput }] of Object.entries(metadata.outputs['main.js'].inputs)) {
  if (bytesInOutput && path.endsWith('.ts') && !checked.has(path)) {
    console.error(`Bundled source missing from Obsidian lint: ${path}`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
