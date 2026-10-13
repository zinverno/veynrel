# Showcase 500 — Rerank Evaluation v1

**Published Veynrel 2.1.0 was exercised on all 500 existing showcase Markdown notes, with real embeddings and paid native Rerank.** Total cost: **$0.01263000**, reconciled to both provider receipts and aggregate key usage. All 32 Rerank calls passed the production validator.

This corpus cannot support the requested 80 substantive positive questions. Full-content inspection found three recurring generic prose patterns, five declared note purposes, domain vocabulary, links, review prompts, and 100 identical flashcard answers. It contains no topic-specific technical explanations or procedures beyond those templates. The frozen set therefore contains **4 distinct general review-workflow positives and 20 no-answer diagnostics**, 24 intent IDs, with 12 English and 12 Russian questions. No substitute corpus or topic-name question padding was used.

Document ranking quality is saturated: all 500 complete notes answer each of the four general positives. The primary result is **0 Improved / 4 Unchanged / 0 Regressed**. Separately, Voyage increased complete answer-bearing fragments in the four top-10 lists from **29/40 to 40/40**. That limited fragment result does not establish a document-ranking advantage on substantive user knowledge.

Machine-readable public aggregates: [showcase500-rerank-v1-summary.json](showcase500-rerank-v1-summary.json). Original text, filenames, queries, qrels, vector caches and provider outcomes remain local and are not included in this PR.

## Version and isolation

- Release tag: `2.1.0`; annotated tag object `5862264c656be244e00dd68dd7888a0aa39b291c`.
- Peeled tag, release target and production checkout: `6df435f1f1cd1f9421f908b816dcae02df1a4f9e`. Remote main matched this commit at initial verification on 2026-10-13.
- Published assets were downloaded and compared against a fresh build of the detached release checkout. Package and manifest identify 2.1.0.
- `main.js`: `b486f747a407aa4aee5229378aa5446d6c766a45a1087c46bff966d3e736031c`.
- `manifest.json`: `1d701d48f24d7303b0f9c1657756260f9f72b3227a07bedeb239c64bd55a8282`.
- `styles.css`: `5bfb7a7a8ea3253fcdfff86a1a4c92215047846453b6bd7ad5f45946a15ab3e7`.
- Test branch: `test/showcase500-rerank-evaluation`, separate worktree based on the release commit. The original worktree was clean and remained on its existing release branch. The unrelated open historical PR #71 was left untouched.

Only scripts and these two reports are changed. Production source, defaults, dependencies, release assets, tags and historical experiments are unchanged. Existing Graphify output was absent; source-level callers and the older experiment drivers were inspected directly.

## Corpus audit

The authorized directory's canonical path was verified locally. The inventory included **500/500 regular Markdown files**, totaling **696,077 bytes**. Original Obsidian configuration and one non-Markdown instruction file were excluded. No Markdown was excluded, and no obvious credential/sensitive-record pattern was found. No symlink was followed. The original directory was never opened as the test vault.

The Markdown-only working copy preserves relative paths and exact bytes. A private manifest records inclusion/exclusion reasons, sizes and SHA-256. Its corpus fingerprint is `6a533c334cd3c44ab7fc7e7813d09131e0ba14b17f28b8987a6e744d7e9bc8f6`. All original and copied Markdown hashes matched after execution.

| Corpus property | Observed |
| --- | ---: |
| English notes / thematic groups | 500 / 10, 50 notes each |
| Topic–group combinations / note-purpose variants | 100 / 5 |
| Empty / multi-section / multi-chunk notes | 0 / 500 / 500 |
| Production chunks / unique embedding texts | 1600 / 1599 |
| Note bytes: min / median / p95 / max | 1232 / 1384.5 / 1525 / 1626 |
| Chunk code points: min / median / p95 / max | 61 / 213 / 1020 / 1073 |
| Exact whole-file duplicate groups | 0 |
| Near-duplicate pairs at threshold | 2833 |

Near-duplicate detection uses character 5-gram Jaccard similarity ≥0.80 after lowercase/whitespace normalization of the full unchanged documents. Connected components cover all 500 notes: ten components of 40 and ten of 10. Component membership does not imply that every pair exceeds the threshold. No duplicate was removed from the index.

The ten broad themes cover databases, distributed systems, machine learning, cybersecurity, networking, software architecture, product/UX, cognition, statistics and knowledge management. Theme words and links provide weak context for technical questions; they do not supply missing procedures. This is a demonstration/template vault, not evidence about an organic personal knowledge base. No positive task intrinsically requires several chunks: a single main-body chunk already contains each generic answer.

## Frozen protocol and annotation

Questions, intent IDs, criteria, seed `500210`, the native case Q001, all four comparison cases and 15 rereview IDs were frozen before any embeddings or Rerank ranks were obtained. The 20 diagnostics include 16 nearby technical topics with missing necessary conditions and four out-of-domain questions. Full-corpus inspection supports no-answer for all 20; uncertain count is zero. Russian questions search unchanged English notes.

Grades are 0–3; substantive relevance is grade ≥2; nDCG gain is `2^grade−1`. An independent agent, without initial grades, result order or model scores, read the unique prose semantically and validated every complete document against the exact template grammar. This permits explicit equivalence expansion without assigning unread documents zero. The resulting qrels contain **12,000 assessed pairs, 0 unjudged**, with source offsets and rationale codes. Every semantic candidate, lexical expansion source and equivalent document is consequently assessed.

Local lexical top-30 searches were recorded separately to broaden annotation. They never alter production candidate membership. Full-corpus assessment already includes sources outside both retrieval methods.

The primary reviewer initially considered grade 2 for Q001 notes without an explicit late flashcard. The independent reviewer found the shared body already supplied the complete requested checks. That disagreement was resolved **before model results**: all 500 notes receive grade 3 for Q001. A late-section task label was not turned into an extra relevance requirement. Q002–Q004 likewise have 500 grade-3 documents each. The predetermined rereview covered 15 questions ×500 documents in a separate pass by the same independent agent: zero grade changes. This is agent annotation, not independent human ground truth.

No labels were changed after model responses. The fragment assessment is separate from document qrels and was performed with selected fragments sorted by document ID, without retrieval order, scores, model outcomes or bills.

## Execution and candidate parity

The production path was `MarkdownChunker → IndexingService → LocalVectorStore → SemanticSearchService → prepareRerankCandidates → refineCandidates`. The entire copy was indexed using real `openai/text-embedding-3-small` vectors, 1536 dimensions. There were 26 index embedding batches, starting with one actual planned chunk to verify billing, followed by one batch containing the 24 distinct queries. No paid dimension probe was needed.

Cache identities bind exact input text, model, endpoint, dimension and encoding. Production indexing/search consumes the saved real vectors. Each query is embedded once; 23 searches run through the Node production adapter, and Q001's single search runs in the installed UI using its already paid query vector. There is no synthetic vector in the quality experiment.

All 24 searches returned 30 documents with up to three original matches. Order and semantic scores were preserved. Each pool was frozen before Rerank; one proven fragment per note was prepared under the release's ID/contentHash, outbound provenance, 4000-code-point and JSON payload limits. Original authored titles and paths were not rewritten. Filename-derived breadcrumb stripping remains production behavior.

Voyage received 720/720 planned fragments; the two comparison models each received 120/120. **Zero candidates were excluded from submission.** Query, membership, order and prepared text are identical across models on Q001–Q004. Final k is 10 throughout. All Rerank requests use the installed production OpenRouter provider, serializer and validator with actual Obsidian `requestUrl`; production sorting is replayed over saved scores for durable outcomes. No chat completions, Decisions, paid judge, connection test, automatic retry or extra paid smoke was used.

## Quality and fragment availability

| Metric, four positive intents | Baseline | Voyage |
| --- | ---: | ---: |
| Hit@1 | 1.0 | 1.0 |
| Hit@3 | 1.0 | 1.0 |
| MRR@10 | 1.0 | 1.0 |
| nDCG@10, frozen document qrels | 1.0 | 1.0 |
| nDCG@10 with grade-1 gain zero | 1.0 | 1.0 |

Improved/Unchanged/Regressed uses delta nDCG with epsilon `1e-9`: **0/4/0**. Zero cases newly acquire a substantively relevant first document; none improves only grade-1 context. Each result already has a grade-3 document at rank 1. The intent-grouped paired bootstrap (10,000 draws, seed 500210) gives mean delta 0 and percentile 95% interval **[0, 0]**. Saturated labels force that result; it does not remove annotation error or establish equivalence across other vaults.

Known relevant-document coverage at 30 is **30/500 = 6% per positive**. All 500 were assessed, but their generic answers are equivalent. The 1880 positive document–query pairs outside the four pools are logged separately; there are **zero query-level retrieval misses**. Complete per-source positions, grade-3 positions, assessed counts, tokens, costs and final orders are in the local report.

The independent semantic fragment audit found **93 complete, 14 partial, 13 wrong-section selections** among 120 positive candidates. All 27 incomplete selections have a complete answer in another single chunk of the same note. No extra chunk was sent to repair them.

| Complete answer-bearing fragments in top-10 | Baseline | Voyage | Cohere | Qwen |
| --- | ---: | ---: | ---: | ---: |
| Q001 | 10 | 10 | 10 | 10 |
| Q002 | 5 | 10 | 9 | 10 |
| Q003 | 4 | 10 | 10 | 10 |
| Q004 | 10 | 10 | 10 | 10 |
| Total | **29/40** | **40/40** | **39/40** | **40/40** |

This is descriptive fragment availability, not a replacement qrel metric or a claim of statistical significance. Voyage and Qwen promoted 11 additional complete fragments; Cohere promoted ten. They reordered existing fragments without recovering a missed section. Q001's late flashcard was transmitted, but its main body was also sufficient; this is not proof of a necessary late-section retrieval success. No complete fragment was demoted out of a full top-10 in these four cases.

All 20 no-answer cases remain no-answer. Their irrelevant/context-only orders are recorded without positive Hit/MRR/nDCG or a fabricated score threshold for abstention. Model scores are not confidence that the corpus contains an answer. Language, topic and task-type aggregates are in the summary; positive theme diversity is explicitly limited to general review workflow.

## Costs, latency and accounting

Official rates checked 2026-10-13: [embeddings](https://openrouter.ai/openai/text-embedding-3-small) and [Voyage](https://openrouter.ai/voyageai/rerank-3-lite) $0.02/M tokens; [Cohere](https://openrouter.ai/cohere/rerank-v3.5) $0.001/search unit; [Qwen](https://openrouter.ai/qwen/qwen3-reranker-8b) $0.20/M tokens. The [official Rerank contract](https://openrouter.ai/docs/api/api-reference/rerank/submit-a-rerank-request) was checked. Zero prompt/completion prices in Rerank endpoint metadata were not treated as free inference.

| Stage | Calls | Actual USD |
| --- | ---: | ---: |
| Initial complete index | 26 | 0.00245470 |
| 24 query embeddings, one batch | 1 | 0.00001362 |
| Voyage, all 24 questions | 24 | 0.00137668 |
| Cohere, predefined four positives | 4 | 0.00400000 |
| Qwen, same four positives | 4 | 0.00478500 |
| **Total** | **59** | **0.01263000** |

The one-time index cost is not a per-search charge. Planning estimate was $0.02401370, below the $0.08 planning and $0.10 absolute limits. Reserves count query/document pairs, use an empirical threefold allowance and a minimum, and are not represented as formal maximum HTTP invoices. First planned embedding billed $0.00000352 for 176 tokens before the next batch proceeded. Every receipt's cost was checked against actual usage units and the relevant tariff.

| Rerank observations | n | Mean ms | Median ms | p95 ms | Max ms | Timeouts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Voyage, complete set | 24 | 723.25 | 602.5 | 1871 | 2436 | 0 |
| Voyage, common positive subset | 4 | 1416.25 | 1291.5 | 2436 | 2436 | 0 |
| Cohere, common positive subset | 4 | 717.75 | 696.5 | 858 | 858 | 0 |
| Qwen, common positive subset | 4 | 889.75 | 836.5 | 1216 | 1216 | 0 |

Provider measurements bracket the production `rank` call, including transport/validation, and exclude startup, preflight, disk reads, index creation and report generation. Heavy test suites ran afterwards. Four observations and fixed model order do not support a robust speed ranking; p95 for n=4 is the maximum. On the same four cases Voyage cost $0.00029610, Cohere $0.004, Qwen $0.004785; every model's document nDCG was 1.0.

The separate journal at `~/.local/state/veynrel/showcase500-rerank-v1/budget.jsonl` contains stable operation IDs, immutable plan bindings, fsynced pre-HTTP reservations and receipts. No historical journal or ceiling was changed. Pools are bound after retrieval, before any Rerank. Unknown bills stop all new sends; a lost local paid result never licenses another HTTP request. The final free accounting observation reconciled exactly: **aggregate delta = receipt total = $0.01263**. Usage lag was observed; the two values were not added together. No generation lookup was needed.

## Native evidence and limitation

Linux Obsidian **1.14.4**, Electron **43.6.0**, installed Veynrel **2.1.0**, full 1600-vector index. Q001 used the real search modal, displayed baseline results, explicitly clicked Refine, and received its real Voyage response. There was no Rerank before the button and no second query embedding during refinement. Semantic scores were unchanged, order switches performed no API, and the local title rendered correctly. All 32 paid Rerank requests used the native adapter. Real keys were absent from `data.json`; installed asset hashes remained exact.

The original live driver failed its final immediate cursor assertion after the file became active. The modal awaits `openFile` before positioning the cursor; active-file readiness is insufficient. The test driver now awaits the cursor. A **separate free UI replay of the same saved real result**, with all HTTP blocked and no key access, confirmed opening the expected line. This is reported separately: the original live session did not successfully assert cursor position. The paid Q001 operation was not repeated. No product defect was established or fixed; the safe reproduction is `showcase500-native-navigation.mjs`.

Node evidence covers production chunking/index/search/preparation/sorting and metrics. Native adapter evidence covers real OpenRouter transport/validation. Native UI evidence covers one planned query, manual action, ordering and local navigation with the caveat above. Mobile, other operating systems, human relevance review and substantive technical-answer quality are NOT RUN.

## Reproduction and retained evidence

Use an isolated checkout of tag 2.1.0 at `/tmp/veynrel-showcase500-release`, install locked dependencies, build and verify the expected hashes. The scripts bundle production modules only from this checked release root. The test branch can be located separately. These scripts are specific to this experiment; they are not a generic benchmark framework.

```sh
# Free; no credential access or HTTP. Uses the prepared release checkout.
node scripts/showcase500-rerank-v1.check.mjs
node scripts/showcase500-rerank-v1.mjs
node scripts/showcase500-rerank-v1.mjs prepare --source /path/to/authorized/showcase

# Private authored queries, protocol, reviewed qrels and tariff snapshot are required.
# The public repo intentionally does not contain or regenerate private note content.
node scripts/showcase500-live.mjs                 # dry-run, freeze/check plan
node scripts/showcase500-rerank-v1.mjs preflight --live  # free authenticated GET

# Explicit paid phases; require the existing bound journal and original unchanged inputs.
node scripts/showcase500-live.mjs --live embeddings
node scripts/showcase500-live.mjs --live native

# Local report generation; publishing writes only the explicit aggregate allowlist.
node scripts/showcase500-report.mjs --write-public
```

Do not clear a lock or uncertain operation automatically, choose a new journal, or reset budget state. Tariff-date drift stops new sends. Completed operations reuse receipts/cache; the private manifest, query, qrel and pool hashes must match. Native/profile actions require the normal localhost/GUI permission.

The private working artifact root is `/tmp/veynrel-showcase500-local`; a durable copy is retained at `~/.local/state/veynrel/showcase500-rerank-v1/artifacts`. It contains the source manifest, one document/chunk registry, queries/protocol, qrels/rationale and rereview, pools with chunk references rather than repeated full text, real embedding caches, outcomes, fragment audit, full report, native evidence and accounting observations. The original vault path is only in that private manifest. The journal remains one level above the durable artifacts.

Fresh checks: **npm test PASS (2910 tests / 115 files); typecheck PASS; lint PASS with the existing allowlisted `api.ts:402` fetch warning; build PASS with identical release hashes; git diff --check PASS; new free runner checks PASS.** Historical free budget/runner checks are also retained and verified. Ordinary npm test/CI does not invoke paid phases. No dependency or warning remediation is part of this branch.

Practical conclusion: the full published path works on this existing 500-note showcase and stayed far below budget. Reranking helped display complete fragments for two general questions, while document-level ranking remained uninformative. A future benefit claim needs a separately authorized corpus with varied substantive answers and stronger relevance review. No default, model-choice or product behavior change is warranted by this run.
