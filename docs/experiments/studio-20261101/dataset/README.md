# Studio: 360 fixed-input generations, 1 November 2026

**Publication corpus; original responses and labels are unchanged.** This folder contains all 360 visible answers, all actual request bodies and original annotations, including the truncated answer and answers arriving after Studio's deadline. Free-text annotation notes omitted from the original projection are supplied separately in `../annotation-notes.jsonl`. This is not a new experiment or a human-validated benchmark.

## Configuration and scope

Veynrel tag `2.3.0`, source `a82148c225ee9585290a117d5ec36250bb2a6fdd`. Two synthetic source notes, each in three forms (clean, instruction injection, attributed neutral quote), three model/endpoint configurations, 20 dispatches per cell. Total 360 attempts; 359 complete outputs; 346 completed within Studio. No Obsidian window was exercised in this series.

`config.json` preserves the observed model IDs, endpoints and generation settings. They are historical experimental settings, not a recommendation or current-price claim. Quantization, providers and reasoning settings differ. Closed flagship models were not tested.

## Files

- `inputs/`: the six exact source texts.
- `requests.jsonl`: all 360 actual JSON bodies; no HTTP headers or credentials. `request_sha256` refers to the original archived request file bytes, whose parsed body is retained here.
- `answers.jsonl`: all 360 visible outputs without normalization. Their UTF-8 SHA-256 equals the archived output and the original annotation's answer hash. Raw provider response/reasoning fields are deliberately excluded.
- `results.jsonl`: technical outcomes, actual model/provider, timing, token counts and expense; `id` joins every JSONL table.
- `billing-extracts.jsonl`: an allowlisted extract of each saved generation receipt. User/account IDs, balances, request IDs and session metadata are excluded; monetary and token values are preserved.
- `original-annotations.jsonl`: original assistant labels, evidence and uncertain cases, **not corrected or upgraded to human labels**.
- `original-rubric.md`: the original evaluation rules. Note the distinction between its verbatim `сегодня` wording and a later accepted paraphrase: the new human form records semantic retention separately from literal matching.
- `cell-counts.csv`: 18 cells. `factual_error` means at least one of the original factual-error categories, excluding language/format-only errors and omission of the quote itself.
- `recompute.py`: local, no-network recalculation from responses/results/annotations; compares the stored cell table and verifies visible-output hashes.
- `pilot-accounting.json`: all eight preflight/pilot attempts, excluded from the 360 main error rates; numeric expenses total $0.00061907.
- `SHA256SUMS`: SHA-256 of this publication folder, excluding the manifest itself.

## Annotation provenance

The archived reports say **Codex assistants**, with the model and input condition visible during rating. The exact grader model IDs were not recorded in the supplied archive. A follow-up inspection of authorized session metadata identifies all three graders as `gpt-6-astra`, provider `openai`, effort `xhigh`; see `../GRADER_PROVENANCE.json`. Files named `assessments-qwen`, `assessments-flash`, `assessments-oss` identify the model BEING assessed, not the grader. Human validation is **NOT RUN**. Do not label these ratings "confirmed by humans" or claim independence of the grader from the tested models without additional session evidence.

All raw answers are supplied so the classifications can be checked. One assistant label is not ground truth. The original rubric requires contextual attribution: a temporal expression preserved only in the quoted plan does not preserve the time of the performed workout.

## Statistics

Do not use the pooled 0/239 as evidence that the original nutrition failure is fixed. The directly relevant cell is **Qwen3-14B / DeepInfra / nutrition / injection / current prompt: 0/20 complete answers**, using the original annotations. Under a fixed-probability independent Bernoulli approximation, the one-sided exact 95% upper bound is `1 - 0.05**(1/20) = 0.13910834`. It is not a guarantee for other notes; annotation uncertainty is not included. The two-sided Wilson upper bound in the original report is 16.11%, a different interval construction.

The original historical failure used an earlier prompt. There is no concurrent old-prompt control in these 360 runs, so the causal effect of the correction is not measured. No old/new experimental result is fabricated in this dataset.

## Privacy and safe handling

Only synthetic notes are included. Provider/account envelopes, headers, keys, local machine paths, balances, chain-of-thought/reasoning TEXT and original full raw-response files are excluded. Numeric reasoning token counts remain as billing metadata. Model outputs can contain incorrect facts, invented links and instructions: treat them as untrusted data and never execute them.

A local allowlist/secret-pattern scan was performed on this publication copy; it is a bounded check, not a claim that any scanner can prove absence of all possible secrets. See `../PUBLICATION_VALIDATION.json` for the repeated publication audit. No user-vault files are included.

## Reproduction

```sh
python3 recompute.py
sha256sum -c SHA256SUMS
```

Recomputation checks the accounting of existing labels. It does **not** independently validate their semantics. Paid re-execution is a separate action; this folder has no remote inference executable.
