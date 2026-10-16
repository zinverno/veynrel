# Rerank / Decisions live evaluation

**2026-10-07: Decisions completed 21 real requests, including one native Obsidian flow. Provider-reported cost: $0.000488922. Rerank sent zero requests: its billing upper bound remains unverified.** No additional paid run is needed to reproduce this report.

| Gate | Rerank | Decisions |
| --- | --- | --- |
| Live production adapter | **BLOCKED: billing upper bound** | **PASS**, 21 validated responses |
| Native Obsidian with real transport | **BLOCKED: billing upper bound** | **PASS**, one preview → explicit launch → tentative result |
| Small synthetic evaluation | Four fixed pools **NOT RUN** | 16 primary matches, 2 allowed alternatives, 2 disagreements across 20 orders |
| Real semantic retrieval quality | **NOT EVALUATED** | Not a retrieval evaluation |
| Native with fake transport | **PASS**, including one-search refinement | **PASS**, including exact preview and explicit launch |

The live result establishes API/validator/UI compatibility for these inputs. It does not establish reliable duplicate detection, calibrated confidence, or improved search. A separate free reproduction found a filename-derived text boundary defect for headerless notes; see below. Production behavior was not changed in this validation PR.

Artifacts: [sanitized live evidence](rerank-decisions-live-evidence.json), [fake native evidence](rerank-decisions-fake-native-evidence.json), [frozen cases](rerank-decisions-live-cases-v1.json), [frozen live plan](rerank-decisions-live-plan-v1.json). Delivery remains [PR #71](https://github.com/zinverno/veynrel/pull/71), branch `test/rerank-decisions-live-evaluation`, base `main`, open and unmerged.

## Source, build and environment

GitHub confirmed [#69](https://github.com/zinverno/veynrel/pull/69) and [#70](https://github.com/zinverno/veynrel/pull/70) merged. Current checked production `main` is **`6a405e2e7d90be41f722e2a80995628ce56ad83c`**, the actual #70 merge. Neither PR was changed.

The evaluation checkout was `5495683a6c1c684db068426ef05dc60b49116908` with the new driver uncommitted during execution. This report does not claim the paid run occurred on a later delivery commit. Evidence fields `replayCheckoutCommit` and `replayRunnerSha256` describe offline report generation; the execution driver hash is pinned below. The installed production files were freshly built, unchanged from the checked main:

| Artifact | SHA-256 |
| --- | --- |
| `main.js` | `ae2fce2d38c5003ec4888f516de572544b30ceb9ac75f8f8c5d489644a6175ea` |
| `styles.css` | `443b21f59f0326e38e369f67af2159a3d965a1cbbb053c7ca5a2d70f4a60dfff` |
| `scripts/live-evaluation-native.mjs` used for live | `1a64f66d1fb5753d1ea2d9f53505f5d6f0fb956e1c72205dc9e57efaaaa1018a` |
| Live plan | `645986893576e863232c7b67065cf3aac1891248fbae4dbbbe8109171f2ff25e` |

Host: **Linux x64, Node 24.14.1**. Running native app: **Obsidian 1.13.7**, **Electron 43.6.0**; app version read from General settings. Live execution began at **08:45:54 UTC**. The completed-journal restart at **08:50:06 UTC** skipped every operation before key loading or native startup. Evidence `finishedAt` is the last runner exit, including this restart, not the last provider-response timestamp.

The disposable vault/profile were under `/tmp/veynrel-live-evaluation-v1/live`. Fourteen synthetic notes contained an explicit `# Fragment` heading. Companion was disabled, unrelated cloud credentials were empty, and embeddings used a localhost fake with fixed vectors. Two local synthetic embedding calls prepared the native fixture; **zero paid embedding calls**. An earlier localhost Ollama availability probe returned `ECONNREFUSED`; no real local embedding model was established or downloaded. Artificial vectors provide no semantic-quality baseline.

## Rates, routes and budget

Official sources were rechecked before the paid dispatch on 2026-10-07:

| Capability | Exact model | Route | Reviewed rate |
| --- | --- | --- | --- |
| Rerank | [`cohere/rerank-v3.5`](https://openrouter.ai/cohere/rerank-v3.5) | [`POST /api/v1/rerank`](https://openrouter.ai/docs/api/api-reference/rerank/submit-a-rerank-request) | $0.001/search unit |
| Decisions | [`typesafe/jev-1.13`](https://openrouter.ai/typesafe/jev-1.13) | [`POST /api/alpha/decisions`](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request) | $0.042 / million input tokens; output $0 |

The authorized ceiling remains **$0.10**, planning ceiling **$0.08**, maximum **32 requests**. The $0.02 margin was not used to expand the experiment. No account limits, balance, payment settings, models, endpoints or authentication for Codex were changed.

For Decisions, [TypeSafe's model reference](https://docs.typesafe.ai/models) documents a 64k total request budget, including state and all questions, and a 32k state-plus-longest-question limit. OpenRouter lists 32,000 context tokens. Reserving the larger **65,536 input tokens per request** rounds the documented 64k upward and includes Choice criteria and service context, rather than estimating tokens from fragment characters. At $0.042/M, the reserve is **$0.002752512 per call**. The announced plan was **21 calls × $0.002752512 = $0.057802752**, with zero Rerank calls, connection probes, remote embeddings or retries.

Rerank remains blocked independently. [Cohere pricing](https://cohere.com/pricing) defines a search unit using up to 100 documents and counts long-document chunks. [Cohere v1](https://docs.cohere.com/v1/reference/rerank) has an upstream default chunk cap, but the reviewed OpenRouter route does not establish that mapping or expose a caller-set cap. Thus its conservative billed-unit upper bound is **unknown**, not inferred from short synthetic strings or a key limit. A previous provisional four-unit allowance was not used as an authorization to send.

Actual accounting from the durable journal:

| Operation | Calls | Provider-reported USD |
| --- | ---: | ---: |
| Native Decisions scenario | 1 | 0.000024822 |
| Decisions frozen evaluation | 20 | 0.000464100 |
| Rerank | 0 | No charge initiated; no provider receipt |
| Paid embeddings / connection tests / retries | 0 | No charge initiated; no provider receipt |
| **Total** | **21** | **0.000488922** |

All 21 costs were reported by the provider. Total usage was **11,641 input / 1,352 output tokens**. The independent usage × reviewed-rate cross-check is also **$0.000488922**; it is not an additional expense. Usage-derived settlement was not needed (`calculatedFromUsageUSD: null`). **Unresolved reservations: $0**. No absent provider cost was converted to zero. No account-balance reconciliation was performed, so “provider-reported” is not an independently audited invoice.

The journal stays outside Git at `/home/zinvernix/.local/state/veynrel/live-evaluation-v1/budget.jsonl`, bound to fingerprint `78aaa48727b60f0b08f4e530a992e3d3f1d4979ce813f1c3bebc4723f908d958`. It reserves and fsyncs before dispatch, uses integer nanodollars, locks concurrent writers, and preserves completed or unresolved entries across restarts. Unknown cost, timeout, network interruption, invalid response or another technical failure stops subsequent paid work. Pending reserves are not automatically released. Deleting the journal or picking a new filename does not erase spending; the driver refuses a missing journal in an already-established state directory. A local case ID is not provider idempotency.

## Frozen inputs and criteria

The manually reviewed copy is **`live-evaluation-v1`**, SHA-256 **`6c3a1ac4c540add14e64e821fff8c49ce82a7ef6a3f375fb0cee25701b590906`**. Production criteria stayed **`overlap-v1`**. Source file hashes:

- `rerank-v1-evaluation.json`: `a6213ed3b33c26625ec537aafb910ed7d8cd86b238be3f27de97a5ddec714973`
- `decisions-v1-evaluation.json`: `1d551dca41743fcdc027aded51caaf662fdf75cac174f1eb69e1344934ccee2f`

The copy also pins adapter and criteria hashes. The driver rejects changed inputs, production sources, plan or build. Production serializers determine the exact body hashes. Labels, alternatives, criteria and case order were not changed after seeing model responses.

Before live work, both `ru-paraphrase` orders were assigned primary **`partial_overlap`**, allowed alternative **`same_information`**. “Встреча перенесена…” adds rescheduling, absent from “Во вторник встречаемся…”. The alternative records a pragmatic reading of the resulting arrangements. All other reviewed labels were retained. These are human annotations, not measured ground truth.

The native case is an explicitly budgeted **21st input**, separate from the twenty frozen orders: the meeting pair with `Fragment\n\n` prefixed by the production chunker from an actual Markdown heading. Its primary/alternative labels were fixed in the plan before any live result. Keeping it separate avoids silently changing the twenty original inputs.

## Actual native and adapter path

The installed plugin's original Decisions provider factory and Obsidian `requestUrl` transport handled every paid operation. A single-use transport wrapper checked the exact endpoint and production-serialized body hash, copied only safe numerical accounting, and returned the original response unchanged to the production validator. It did not change categories, sorting, criteria, JSON or validation. It did not run the old fake-native scripts with a real key.

The native scenario selected the existing `00-A.md` / `01-B.md` card in the potential duplicates modal, clicked **Assess overlap**, verified both visible previews against the eventual request state, and observed **zero preview requests**. A separate assessment-button click caused one real request. Observed states were **preparing → ready → preparing → assessing → result**; the second preparation is the production pre-send recheck. The UI displayed both the tentative model wording and the limitation to fragments rather than entire notes. Assertions were enforced, not merely captured in a log.

Native result: `same_information`, probabilities `[0.99, 0.01, 0, 0, 0]`, confidence `0.99`, **1,006 ms**, 591 input / 64 output tokens, cost **$0.000024822**. This matches the predeclared alternative, not the primary annotation. The remaining twenty inputs invoked the same installed production provider/transport/validator once each, sequentially; they are adapter evaluations, not twenty separately exercised UI flows.

Requested model was **`typesafe/jev-1.13`**, resolved model **`typesafe/jev-1.13-20260917`** for all 21 responses. Every response had HTTP 200 and passed production Choice validation. No HTTP-success/validator-failure discrepancy occurred. No model or endpoint fallback, automatic retry, extra connection test or paid judge was used.

The authorized key source was read programmatically into process memory and passed as `OPENROUTER_API_KEY` to the isolated native child. Its initial readiness check emitted only `READY`. The renderer removed that environment entry after taking an in-memory copy; the actual key was supplied to provider instances, not plugin settings. Temporary settings were checked to contain no real API key. No temporary secret file was created, the original source was untouched, and the child and local fixture server were closed. No secret, Authorization header, raw provider body or personal note is in the committed evidence.

## Decisions results: ten pairs, twenty orders

Abbreviations: **same** = `same_information`; **partial** = `partial_overlap`; **related** = `related_distinct`; **context** = `insufficient_context`. Probability-vector order is **same / partial / related / unrelated / context**. Confidence is the model's reported field, not accuracy or text-match percentage. Latency is harness-observed operation duration including CDP polling. All rows requested/resolved the model IDs stated above; all were technically validated and had a single highest-probability category under the production tolerance.

| Input | Primary | Allowed alternatives | Choice | Correspondence | Confidence | Probability vector | ms | Tokens in/out | Reported USD |
| --- | --- | --- | --- | --- | ---: | --- | ---: | --- | ---: |
| ru-paraphrase-AB | partial | same | same | allowed-alternative | 0.99 | 0.99/0.01/0/0/0 | 477 | 587/64 | 0.000024654 |
| ru-paraphrase-BA | partial | same | same | allowed-alternative | 0.99 | 0.99/0.01/0/0/0 | 630 | 587/64 | 0.000024654 |
| en-partial-AB | partial | — | partial | primary-match | 1 | 0/1/0/0/0 | 520 | 545/64 | 0.000022890 |
| en-partial-BA | partial | — | partial | primary-match | 1 | 0/1/0/0/0 | 469 | 545/64 | 0.000022890 |
| ru-aspects-AB | related | — | related | primary-match | 0.85 | 0/0.01/0.88/0.11/0 | 577 | 576/65 | 0.000024192 |
| ru-aspects-BA | related | — | related | primary-match | 0.89 | 0/0.01/0.91/0.08/0 | 623 | 576/65 | 0.000024192 |
| en-contradiction-AB | related | — | related | primary-match | 1 | 0/0/1/0/0 | 522 | 527/65 | 0.000022134 |
| en-contradiction-BA | related | — | related | primary-match | 1 | 0/0/1/0/0 | 520 | 527/65 | 0.000022134 |
| ru-unrelated-AB | unrelated | — | unrelated | primary-match | 1 | 0/0/0/1/0 | 467 | 562/65 | 0.000023604 |
| ru-unrelated-BA | unrelated | — | unrelated | primary-match | 1 | 0/0/0/1/0 | 518 | 562/65 | 0.000023604 |
| en-context-AB | context | — | related | disagreement | 0.35 | 0/0.08/0.48/0.02/0.42 | 467 | 523/65 | 0.000021966 |
| en-context-BA | context | — | related | disagreement | 0.89 | 0/0/0.91/0/0.09 | 466 | 523/65 | 0.000021966 |
| translation-AB | same | — | same | primary-match | 1 | 1/0/0/0/0 | 522 | 565/64 | 0.000023730 |
| translation-BA | same | — | same | primary-match | 1 | 1/0/0/0/0 | 569 | 565/64 | 0.000023730 |
| en-ambiguous-AB | partial | related, same | partial | primary-match | 0.8 | 0.16/0.84/0/0/0 | 521 | 529/64 | 0.000022218 |
| en-ambiguous-BA | partial | related, same | partial | primary-match | 0.94 | 0.03/0.96/0.01/0/0 | 471 | 529/64 | 0.000022218 |
| ru-ambiguous-AB | partial | context | partial | primary-match | 0.95 | 0.04/0.96/0/0/0 | 518 | 575/64 | 0.000024150 |
| ru-ambiguous-BA | partial | context | partial | primary-match | 0.97 | 0.02/0.98/0/0/0 | 469 | 575/64 | 0.000024150 |
| en-caveat-AB | partial | — | partial | primary-match | 1 | 0/1/0/0/0 | 466 | 536/64 | 0.000022512 |
| en-caveat-BA | partial | — | partial | primary-match | 1 | 0/1/0/0/0 | 517 | 536/64 | 0.000022512 |

Totals: **16 primary matches; 2 allowed alternatives; 2 disagreements; 0 ambiguous/tied responses; 0 technical failures**. All **10/10 original pairs** retained the same choice when A/B was swapped; the highest-category sets also matched for 10/10, each being a singleton. The [JSON evidence](rerank-decisions-live-evidence.json) records each comparison. Twenty orders are ten semantic examples, not twenty independent samples.

Additional information/caveats, different aspects of one topic, contradiction, unrelated text and the translation example followed their primary labels. The meeting paraphrase followed the predeclared alternative in both orders. The missing-context example did not: both orders chose `related_distinct` instead of `insufficient_context`. Its probability on `insufficient_context` changed from **0.42 to 0.09**, while confidence changed **0.35 → 0.89**. Stable choice therefore did not mean stable uncertainty. This does not support reliable abstention or calibrated confidence; the reported confidence is not correctness evidence. No labels or production thresholds were tuned to these outcomes.

## Rerank results and remaining blocker

All four relevant fragments exist in their fixed three-fragment pools, but no real ranking was obtained:

| Case | Relevant fragment | Fixed pool contains it | Reranked position / top-1 / top-3 |
| --- | --- | --- | --- |
| ru-cancellation | revision | Yes | NOT RUN / — / — |
| ru-offline | local-asr | Yes | NOT RUN / — / — |
| en-rollback | conditional-restore | Yes | NOT RUN / — / — |
| en-incomplete | coverage | Yes | NOT RUN / — / — |

The JSON object order is not a semantic-search baseline. Top-3 in a three-item pool would offer little discrimination even if run. No rise in this fixed order is claimed as an embedding improvement.

For **each of these four queries**, relevant-in-real-retrieval-pool, first relevant position before/after, top-1/top-3 before/after and improvement/degradation are **unknown / NOT EVALUATED**. Only fake vectors were available for the native harness. A future real retrieval evaluation must use existing semantic search with a real embedding model and one shared candidate search for baseline/refinement, keeping the same final `k` and recording missing relevant candidates. Such calls were not silently added to this plan.

The free native Rerank driver did exercise **semantic → refining → reranked**, with exactly one query-embedding call and ten displayed results at every stage. That verifies harness/UI orchestration with a fake provider, not Rerank's live integration or ranking quality. Rerank's live driver is implemented but the independent tariff gate remains closed.

## Defect found without a paid request

**Filename-derived text from headerless notes — existing product preparation defect.** `MarkdownChunker` uses a basename as a synthetic root heading for a note without a Markdown heading. `decisions/preparePair.ts` forwards that chunk text. Even though the JSON has no path field, `state.fragmentA`/`fragmentB` can therefore contain the filename-derived title. This conflicts with the intended filename-exclusion boundary.

Reproduction: `node --test scripts/live-evaluation.check.mjs` includes a characterization using the real chunker, `preparePair` and `decisionsBody`. Files `Synthetic-title-A.md` / `Synthetic-title-B.md`, with bodies `A synthetic fact.` / `Another synthetic fact.`, produce fragments beginning `Synthetic-title-A\n\n` / `Synthetic-title-B\n\n`. The check currently **passes by reproducing the defect**; it is not a passing privacy acceptance test. No model is called for this reproduction.

The live fixture had explicit `# Fragment` headings and exact transmitted-body guards, so this is **not an observed filename disclosure in the paid run**. It is still a product boundary issue to correct separately before claiming filenames are excluded or accepting that privacy requirement for release. Minimal follow-up: distinguish document-authored text from the synthetic basename in outbound preparation, preserve chunk id/contentHash validation and exact preview equality, and turn the characterization into an exclusion regression test. Inspect the shared chunk-text path for Rerank as well; this test proves the Decisions path only. Do not alter global chunking, embedding space or the index merely to repair outbound presentation.

There was no live transport/Choice contract defect. The `en-context` disagreement is a model/annotation outcome, not a transport error. It warrants cautious product interpretation and broader future evaluation, not an ad hoc criteria or validator change. No production fix, semantic score mutation, Markdown edit, Findings update or release was included here.

## Reproduction and safe restart

Installed dependencies are reused; no new dependency, CI task or product feature was added. From the repository root:

```sh
npm run build
node --test scripts/live-evaluation.check.mjs
node scripts/rerank-decisions-live.mjs
node scripts/rerank-decisions-live.mjs --out /tmp/veynrel-live-preflight-new.json
node scripts/rerank-decisions-live.mjs --fake
node scripts/live-evaluation-report.mjs
git diff --check
```

Default is an offline dry-run even with a key available. `--out` refuses to overwrite a file. `--fake` launches the isolated native fixture with fake transport and its own journal; it never loads the real key. Its 26 operations cover both native paths, four Rerank fixed pools and the twenty Decisions orders. Completed fake operations also skip on restart. [Saved free evidence](rerank-decisions-fake-native-evidence.json) records the final 26-call fake run and its no-repeat restart. The report script only replays safe saved results from the existing live journal, never calls a provider or launches Obsidian.

The explicit paid entry point used for this authorized run was:

```sh
node scripts/rerank-decisions-live.mjs --live
```

**The live journal is already complete. Do not remove it, change its fingerprint, use another state directory or repeat these inputs as a new run.** Its observed restart sent zero requests and retained the exact cost. The driver also enforces the reviewed plan date; later dates require fresh tariff review, never a journal reset. Production source/build/plan mismatch fails closed. After a crash, an unresolved entry or stale lock requires inspecting provider accounting before any further operation; no automatic retry or accounting reset exists.

Credential source is the exact authorized local file `/home/zinvernix/.config/veynrel/openrouter-test.key`; the native child receives its content only in `OPENROUTER_API_KEY`. The driver does not search other files or personal vaults. GUI/network/filesystem permissions still apply to the relevant command; budget authorization does not disable sandboxing. Do not run `scripts/rerank-native.mjs` or `scripts/decisions-native.mjs` wholesale with real credentials: their errors, delays and retry scenarios must remain free.

Manual acceptance without another bill: inspect the per-case evidence and fixed inputs, then run the free guard checks. `--fake` opens the isolated native comparison on its first run; a completed fake journal skips it. To exercise the native driver again, use a fresh **fake-only** directory with the required prefix, without touching live accounting:

```sh
node --input-type=module -e "import {runNative} from './scripts/live-evaluation-native.mjs'; await runNative({fake:true,fakeRoot:'/tmp/veynrel-live-evaluation-v1/fake-review-1'});"
```

Confirm preview is local, the assessment button is separate, result wording is tentative, and Rerank renders its three stages. The real run's data and outcome are already recorded; a new paid connection test would add no necessary evidence.

## Fresh checks and limits

- `node --test scripts/live-evaluation.check.mjs`: **17/17 passed**, including money/count caps, cost provenance, unknown cost, timeout/disconnect/cancellation, replay/duplicate prevention, interrupted reservations, corrupt journals/locks, native orchestration restart, persisted-state loss refusal, enforced native assertions, HTTP-success/validator-failure accounting, classification and the explicit headerless-note characterization.
- `npm test -- rerank decisions`: **4 files / 92 tests passed**.
- `npm test`: **114 files / 2,823 tests passed**.
- `npm run lint` (including fresh typecheck and build): **PASS**, zero errors and one existing `api.ts:402` warning about `fetch`; that file is unchanged.
- `npm run audit:proposals`: **PASS**, 5/5 mutations killed and every restored test passed on the isolated rerun. The first attempt failed because the nested test stdout was empty; no code was changed before the successful rerun. Its cause was not established as a product regression.
- `npm run build`: **PASS**, installed hash above; final rebuilt hash checked separately.
- Node syntax checks and `git diff --check`: **PASS**.
- Fresh native fake run: **26 fake requests, 0 paid**, both native assertions passed; restart retained 26.
- Native/live Decisions run: **21 paid**, all validated; restart retained 21 with unchanged cost and no unresolved reserve.

Pre-live review corrected runner issues around persistent accounting, cleanup, and enforcing native UI assertions while retaining a provider receipt on assertion failure. Free tests verified these before paid execution. No production TypeScript, criteria, timeout, validator, sorter, dependency, version or package/CI configuration changed. These scripts are not invoked by ordinary `npm test` or CI.

This run exercised English native UI on Linux desktop with short synthetic fragments. Russian localization, keyboard-only use, long/narrow layouts, mobile, other operating systems, real embeddings, provider error behavior in native live, and semantic quality beyond these ten pairs are not claimed as freshly live-tested. Existing fake/unit checks remain distinct evidence. Actual provider confidence is not calibrated accuracy; no automatic note decisions were made.

**Release interpretation:** Decisions API and one native flow are confirmed for this build/model, with the documented missing-context failure and a separately reproduced filename boundary defect that needs correction before privacy acceptance. Rerank real integration remains unverified until billing can be bounded; its search-quality comparison is still outstanding. No release, merge, cloud pilot, account infrastructure, automatic note action or reliability claim follows from this small run.
