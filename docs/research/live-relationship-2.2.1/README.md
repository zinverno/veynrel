# Veynrel 2.2.1 Relationship Analyzer: 10 real-model requests in Obsidian

*24 October 2026 · Small, purposive integration smoke test · Synthetic Markdown only*

This report documents a real OpenRouter model run **through Veynrel 2.2.1 in Obsidian**, not scripted LLM replies. It is a test of the **technical contract and one end-to-end guarded write**, not a benchmark of semantic quality, duplicate-detection accuracy, or the best action for a user.

- **Pinned plugin source:** [`79fabc93bd946f0287b431721126efee0646f588`](https://github.com/zinverno/veynrel/tree/79fabc93bd946f0287b431721126efee0646f588); release `2.2.1`.
- **Provider / requested model:** OpenRouter / `deepseek/deepseek-v4-flash-0731`. The upstream backend changed among requests; model ID alone does not guarantee one backend.
- **Frozen synthetic cases:** 10 pairs / 20 Markdown files. The full relative paths and complete input text, raw model `refs.v2` content, corresponding evidence excerpts, checks, timings, and reported per-case costs are in [`cases-and-raw-responses.json`](cases-and-raw-responses.json).
- **Frozen dataset SHA-256 (original `CASES.json`):** `3437ac0ef2f2889fd3b2b078ac1b4b8220a119b00a5eabc1d5fa3c7cc1fba0be`. The published JSON deliberately omits absolute source checkout paths, so its own SHA-256 differs.
- **Production prompt SHA-256:** `33dbdb304a22f9dfaa2594e7169609d4991ced263a10b10dc502e8f1e96bbaac`. Prompt implementation: [`relationshipPrompt.ts`](https://github.com/zinverno/veynrel/blob/79fabc93bd946f0287b431721126efee0646f588/consolidation/relationshipPrompt.ts), validation: [`relationshipEvidence.ts`](https://github.com/zinverno/veynrel/blob/79fabc93bd946f0287b431721126efee0646f588/consolidation/relationshipEvidence.ts).
- **Generation:** temperature `0`, max output `8192` tokens, reasoning disabled for this exact model ID. One request per case, no retries, no model switch, no JSON repair.
- **Input candidate selection:** fixed artificial embedding vectors, not a live embedding-quality test. Real plugin consent/session, `requestUrl`, response parser, validator and preflight were used. Read-only CDP observation captured the original response without replacing transport or repairing content; latency includes that observation overhead.

## Technical results

| Metric | Observed |
|---|---:|
| Requests sent / completed | **10 / 10** |
| Valid JSON / `refs.v2` | **10 / 10** |
| Evidence references accepted | **10 / 10** |
| Accepted by unmodified production validator | **10 / 10** |
| Transport failures, timeouts, validator refusals | **0 / 10** |
| Suggested link / merge / manual review | **5 / 1 / 4** |
| Available Markdown executors after preflight | **6 / 10**, still requiring parameter selection; four recommendations are manual review |
| Median latency | **4.07 s** |
| Range | **2.44–10.00 s** |
| Sum of `usage.cost` | **$0.00226901708** (provider-reported, not independently reconciled to an invoice) |
| Human usefulness judgments | **NOT ADJUDICATED** |
| Single full Apply → separate Undo | **PASS — LR01 only** |

The validator accepts a response when its *format, schema, evidence identifiers, source bindings and local relation/action constraints* pass. It **does not** certify the truth or adequacy of a model interpretation.

## Every case

| ID | Selection category | Relation from model | Recommended action | Production validator | Latency (s) | `usage.cost` (USD) |
|---|---|---|---|---|---:|---:|
| LR01 | Почти одинаковая информация | `same_information` | `consider_merge` | PASS | 3.79 | $0.000340459 |
| LR02 | Частичное пересечение | `partial_overlap` | `add_link` | PASS | 5.87 | $0.000283101 |
| LR03 | Общая тема, разные контексты | `conflicting` | `manual_review` | PASS | 2.44 | $0.0004179 |
| LR04 | Одна заметка дополняет другую | `partial_overlap` | `add_link` | PASS | 4.34 | $0.000184426 |
| LR05 | Потенциально подходящая Markdown-ссылка | `partial_overlap` | `add_link` | PASS | 4.36 | $0.00012401992 |
| LR06 | Похожее содержание, противоречащие условия | `conflicting` | `manual_review` | PASS | 3.39 | $0.00009304524 |
| LR07 | Разные версии одной идеи | `conflicting` | `manual_review` | PASS | 2.59 | $0.00007624692 |
| LR08 | Вероятно стоит сохранить обе без изменений | `related_distinct` | `add_link` | PASS | 10.00 | $0.000217651 |
| LR09 | Два файла с одинаковым названием | `partial_overlap` | `add_link` | PASS | 4.49 | $0.000372351 |
| LR10 | Неоднозначный или недостаточный контекст | `conflicting` | `manual_review` | PASS | 2.55 | $0.000159817 |

All ten rows are retained. The categories were chosen **before** the calls to diversify the inputs, not sent to the model as required answers. A mismatch between the selection category and model relation is **not** counted as a validator failure or an independently scored model error.

## Example: technically valid evidence is not complete semantic support (LR09)

The two files `Study/Caching/Cache lifetime.md` and `Study/Systems/Cache lifetime.md` have the same filename. The real model returned `partial_overlap` and `add_link` and passed every production check. One claim nevertheless said that note A described both expiration-based removal **and a five-minute classroom example**.

The cited **A:5** fragment is only:

> После истечения срока жизни значение удаляется из кэша.

The five-minute example is in the complete source note, **not in the selected cited fragment**. The fragment ID was genuine and from the correct file, so the validator accepted it. This is a **limited evidence-support observation**, not an invented quote and not a completed independent human adjudication. It is precisely why a valid evidence ID must not be confused with proof that the model's entire claim is justified.

The exact response, source text and cited fragment are available under `LR09` in the JSON dataset.

## One actual write and undo (LR01)

The real model recommended `consider_merge` for LR01. The user-style native flow then built a `merge_knowledge` plan. **This was copy-only**, not a full merge or deletion: it copied one selected paragraph from `Realistic/01/B/Note.md` into `Realistic/01/A/Note.md`; the B note was preserved unchanged.

**One Markdown file changed** in Apply. The test compared SHA-256 for *all 20 synthetic Markdown files* to detect any unintended changes. After a separate, journal-guarded Undo, all 20 files again matched their respective initial hashes. This is one tested executor scenario, **not evidence that all Merge choices, multi-file operations, Batch, MOC or atomization have universal Undo**.

## What this does and does not show

It shows that one real model completed ten production-format requests in real Obsidian and that one chosen recommendation could be planned, applied and undone without unexpected Markdown changes. It does **not** establish model correctness, rate of useful recommendations, semantic precision, robustness across providers/models, or embedding quality. No independent human verdicts were obtained. The purpose of this report is auditability of a small integration experiment, not a headline accuracy percentage.

### Data and privacy

All inputs are artificial/fictional notes. Public files intentionally exclude API keys, Authorization headers, provider response IDs, backend provider names, internal machine paths and original provider HTTP envelopes. Synthetic vault-relative note paths are retained for reproducibility. The JSON keeps the original unmodified **model content** strings and their SHA-256, but it is not a byte-for-byte copy of the provider HTTP body. A report of billing is not the same as a separately checked account invoice.
