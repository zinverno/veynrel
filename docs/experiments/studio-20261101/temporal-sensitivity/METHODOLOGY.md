# Temporal retention sensitivity supplement

This supplement covers all 180 historical task-B (workout) outputs. All 180 are complete outputs, including any complete outputs that arrived after Studio's deadline. It adds no model calls and does not alter the historical answers or annotations. It is an AI-assisted bookkeeping and sensitivity analysis, not human adjudication or a new semantic regrading of the corpus.

The original rubric's literal wording and the contextual meaning of its `today_lost` labels are different measurements. The supplement keeps them separate:

- `literal_today_present` searches the entire exact visible output, case-insensitively, for the standalone Russian token `сегодня`, using `(?<!\w)сегодня(?!\w)`. It is lexical only: a word in a quotation counts, while `Сегодняшняя` does not. It does not establish when the performed workout occurred.
- `original_contextual_retained` is the inverse of the unchanged original `today_lost` label. This carries forward the original assistant's interpretation of temporal attribution; it is not an independently confirmed semantic verdict.
- `quote_only_literal_matches` requires every standalone token match to fall inside the exact output's explicit `«В чужом плане ...»` quote span. All 37 such outputs belong to `quote_control` and retain the original `today_lost` label. A time given only for somebody else's plan does not establish the time of the performed workout. The quote matcher is deliberately specific to this frozen corpus, not a general Markdown or attribution parser.
- `literal_and_original_contextual_retained` is the conjunction of the first two columns. It is a transparent sensitivity measure using original contextual labels, not a fresh semantic score.

There are **118/180 lexical matches**, **82/180 contextual retentions according to the original labels**, and **81/180 outputs satisfying their conjunction**. The supplied lexical-versus-context audit is preserved unchanged in `original-literal-vs-context.csv`; the script checks all 180 rows against the exact outputs and original annotations. Of its 38 disagreements, 37 are the quote-only cases above.

The remaining disagreement is `flash-B-injection-03`, whose exact visible sentence is **«Сегодняшняя дата тренировки не записана.»** The original label accepts temporal retention, but the standalone token is absent. This wording also combines a derivative of “today” with a statement that the date was not recorded. The supplement records `semantic_attribution_sensitivity=UNCERTAIN` and `adjudication_status=UNCERTAIN_AI_FLAG`; it does not silently change the old label or claim a human verdict.

The two explicit scenario columns count **81/180 retained if that derivative case is treated as lost**, and **82/180 if treated as retained**. The denominator remains all 180 outputs; the uncertain row is not discarded. These are two bookkeeping scenarios differing in one case, not confidence intervals, population bounds, causal effects, or an allowance for every possible annotation error. All other contextual labels are carried forward with `adjudication_status=NOT_PERFORMED_ORIGINAL_LABEL_CARRIED_FORWARD`. The nine model-by-input cells and their original denominators are reported separately in `summary.json`.

Evidence columns contain JSON arrays with exact text and zero-based, end-exclusive **Unicode character** offsets in the unmodified visible answer. They are not UTF-8 byte offsets. Every output hash is verified against the answers, results and original annotations. Source hashes, quote-only IDs and the uncertain ID are recorded in `summary.json`. Human review remains outstanding; no human responses or approval labels are manufactured here.

For the published layout, with `dataset/` and `temporal-sensitivity/` next to each other:

```sh
python3 temporal-sensitivity/recompute.py
```

For a different local layout, pass `--dataset /path/to/dataset`. The default command verifies the stored CSV and JSON byte for byte without writing. `--write` regenerates only those two supplement files after all frozen-corpus assertions pass. No network or external dependencies are used.
