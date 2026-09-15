import esbuild from 'esbuild';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const production = process.argv.includes('production');

async function main() {
  const result = await esbuild.build({
    entryPoints: ['main.ts'],
    tsconfig: 'tsconfig.json',
    bundle: true,
    metafile: true,
    external: ['obsidian'],
    keepNames: true,
    minifyWhitespace: production,
    minifySyntax: production,
    minifyIdentifiers: production,
    platform: 'browser',
    format: 'cjs',
    sourcemap: production ? false : 'inline',
    outfile: 'main.js',
    target: 'ES2020',
    define: {
      'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
    },
  });
  const output = result.metafile.outputs['main.js'];
  assert(output.imports.every(({ path }) => path === 'obsidian'), 'Unexpected plugin runtime dependency');
  const sharedProposalCode = new Set([
    'companion/src/proposals/types.ts',
    'companion/src/proposals/contentHash.ts',
  ]);
  for (const [path, { bytesInOutput }] of Object.entries(output.inputs)) {
    if (!bytesInOutput) continue;
    assert(!path.startsWith('companion/') || sharedProposalCode.has(path), `Server code in plugin bundle: ${path}`);
    assert(!/(?:\.test\.|\/(?:tests|scripts)\/)/u.test(path), `Test/tooling code in plugin bundle: ${path}`);
  }
  await mkdir('.esbuild', { recursive: true });
  await writeFile('.esbuild/meta.json', JSON.stringify(result.metafile, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
