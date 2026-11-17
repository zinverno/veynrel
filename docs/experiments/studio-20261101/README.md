# Veynrel Studio: fixed-input study, 1 November 2026

This directory publishes the sanitized historical cohort: 360 dispatches, 359 complete texts, 346 Studio-generated results. Source release: 2.3.0 (`a82148c225ee9585290a117d5ec36250bb2a6fdd`).

- [Original dataset](dataset/README.md), unchanged.
- [Publication validation](PUBLICATION_VALIDATION.json).
- [Temporal sensitivity](temporal-sensitivity/METHODOLOGY.md).
- [Grader provenance](GRADER_PROVENANCE.json): gpt-6-astra / OpenAI / xhigh; original graders were not blinded.
- [Post-review supplement](post-review/README.md): the author's stratified sample of 40 outputs, first and clarified decisions, confusion directions, original error categories and HTTP latency distribution.

The 40-case form is complete, but clarification followed feedback and disagreements remain. It is not independent human validation of all 359 labels. All 34 agreements on unsupported additions are negative/negative; 85% agreement does not validate the positive detections. No original labels were overwritten.

Additional paid controls have not run. The supplement does not change historical execution statuses: thirteen complete late Qwen texts and one truncated late text failed under the 30-second Studio deadline used in the study. Later product fixes and offline replay, if documented, must be reported separately; a longer deadline does not make truncated text complete.

Run `python3 dataset/recompute.py` and verify `dataset/SHA256SUMS`. Inputs are synthetic; instructions and links inside generated outputs are untrusted data. Provider credentials, account metadata and reasoning text are excluded.
