# Veynrel Acceptance Lab v2

An offline, deterministic synthetic corpus and a Linux native Obsidian runner. This is a test tool, not a product feature. The generator never calls a model or copies source prose. Generated notes, full manifests, samples, profiles and journals stay outside the repository.

## Generate and inspect

Requires the repository's installed Node dependencies. Choose **new** output and report directories; neither may overlap the source or repository. Parents must already exist. The CLI refuses existing paths even in dry-run mode and does not provide overwrite/recovery switches.

```sh
node scripts/acceptance-lab.check.mjs
node scripts/acceptance-lab.mjs \
  --source "$SOURCE_VAULT" \
  --output "$NEW_LAB_VAULT" \
  --report-dir "$NEW_LAB_REPORTS" \
  --count 1000 --seed veynrel-lab-v2 --dry-run
```

Remove `--dry-run` to create the reviewed dataset. Dry-run reads and validates locally but writes nothing. `--count` accepts 300–1000; 240 files are reserved for 120 labelled pairs. Increasing the upper bound requires expanding the authored content library first. A source change can change the profile fingerprint and theme ordering. Identical source bytes/paths, seed, count and generator produce identical output.

Only fixed allowlisted theme counts derived from paths influence generation. Source Markdown is decoded as strict UTF-8 and converted into SHA-256 hashes of normalized 12-word sequences for a local plagiarism check. Dot directories are excluded; symlinks are rejected. No original path, text, setting, `.obsidian` file or credential enters the generated corpus. The 12-word check and secret patterns are supplementary checks, not a general anonymizer: privacy primarily comes from using authored synthetic content only.

`topics.mjs` contains 60 substantive topics with distinct facts, paraphrases, examples, limitations and exercises. `generate.mjs` combines them with 12 note forms, 8 relationship types, dedicated operation scenarios, long documents and unsupported structures. Six English notes per hundred and fictional dated study entries provide limited language/time variation. This finite authored corpus is deliberately reproducible; it does not emulate every property of a person's history.

External reports contain `manifest.json`, `metrics.json`, and deterministic `sample-50.md/json`. Read all 50 sampled notes before accepting a new seed/library. The manifest schema is `manifest.schema.json`. Pair expectations are hypotheses, not model accuracy labels certified by an independent expert. `expertReview` identifies ambiguous cases. `candidateScenarios` never authorizes a write. All generated entries start with `UNVERIFIED_REAL_PLANNER_REQUIRED`; actual native results are recorded separately.

## Pin the product build

The lab PR is independent of the UX PR. Build the UX commit in an isolated checkout, using `npm ci` and `npm run build`. For this acceptance the commit is `59e57842d8772b5804f7421428e9af5e53b31fa6` from PR #104. Copy only `main.js`, `styles.css`, `manifest.json` into a new artifact directory and create `build.json`:

```json
{"commit":"EXACT_GIT_SHA","sha256":{"main.js":"SHA256","styles.css":"SHA256","manifest.json":"SHA256"}}
```

Use `sha256sum` to obtain hashes from those exact files. Do not copy plugin data/settings or an existing `.obsidian` directory. The native runner checks these hashes before installing into the owned lab. The report records both build and corpus hashes.

## Native offline acceptance

Requires Linux desktop/X11, `/usr/lib/electron43/electron`, `/usr/lib/obsidian/app.asar`, a free local CDP port (default 9286), and permission to launch native applications. No `--no-sandbox` option is used. Close other instances of the lab before running. The runner starts and terminates only its own process with an isolated profile.

```sh
node scripts/acceptance-lab-native.mjs \
  --vault "$NEW_LAB_VAULT" \
  --manifest "$NEW_LAB_REPORTS/manifest.json" \
  --build "$PINNED_BUILD_DIR" \
  --output /tmp/veynrel-lab-native-unique-run \
  --suite all
```

The vault basename must be `Veynrel Lab 1000`. This deliberate narrow guard prevents accidental use on another vault. `ui` runs navigation/visual checks; `actions` runs the same initialization plus Apply/Undo scenarios; `all` runs both. Every run requires the original 1000 manifest hashes. An unknown existing plugin installation is refused. Re-running an owned lab resets only this harness's clean settings and two-vector index fixture; durable operation journals remain intact.

The two persisted synthetic vectors exercise Discover through the production LocalVectorStore. They do **not** represent semantic indexing of 1000 notes. Analyzer completion is replaced at its session boundary with local synthetic JSON, which passes through the actual strict contract and quote validator. Final planners, final consent, tickets, `Vault.process`, on-disk journals, history and Undo remain real. The native report identifies every accepted/refused scenario. Opening Analyzer consent is checked to make zero completion calls. Fetch/XHR/provider-factory counters are instrumentation, not a system-wide network capture.

The UI suite exercises 50 dispatched cache events and 20 actual synthetic file modifications. It explicitly restores the latter fixture's bytes after verifying no concurrent edit. This fixture cleanup is separate from executor recovery. Apply/Undo runs never automatically repair files or retry an operation. On failure preserve the report, screenshot, lab and journals; inspect the failure and use a separately reviewed Undo if applicable. Never reset files to make a failed executor test pass.

All 1000 Markdown hashes must match the initial manifest on success. Complete evidence stays local in the run directory; publish only reviewed synthetic screenshots and aggregate metrics. A 390 px desktop viewport is not a physical mobile test. See [the acceptance report](../../docs/real-vault-acceptance-v2.md) for actual results and remaining gates.

## Estimate embedding input locally

After a successful Undo cycle, this command uses the real chunker without calling a provider. `NEW_LAB_VAULT` and `NEW_LAB_REPORTS` must be exported environment variables. It verifies every note hash before counting; no tokenizer or price is guessed.

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(process.cwd()+'/package.json');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'veynrel-chunk-count-'));
try {
  require('esbuild').buildSync({entryPoints:['chunking/markdownChunker.ts'],bundle:true,
    platform:'node',format:'cjs',outfile:temporary+'/chunker.cjs'});
  const {MarkdownChunker}=require(temporary+'/chunker.cjs'),chunker=new MarkdownChunker();
  const manifest=JSON.parse(fs.readFileSync(process.env.NEW_LAB_REPORTS+'/manifest.json'));
  const chunks=manifest.notes.flatMap(note=>{
    const bytes=fs.readFileSync(path.join(process.env.NEW_LAB_VAULT,note.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),note.sha256);
    return chunker.chunk({path:note.path,content:bytes.toString('utf8')});
  });
  console.log({chunks:chunks.length,nonemptyNotes:new Set(chunks.map(c=>c.path)).size,
    outboundCharacters:chunks.reduce((n,c)=>n+chunker.outboundText(c).length,0)});
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
JS
```
