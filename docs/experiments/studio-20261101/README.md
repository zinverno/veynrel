# Veynrel Studio: fixed-input study, 1 November 2026

This directory publishes a sanitized historical research cohort, not a plugin change or release. Source tag 2.3.0: `a82148c225ee9585290a117d5ec36250bb2a6fdd`.

- [Dataset](dataset/README.md): 360 original dispatches; 359 complete visible answers; 346 Studio-generated results. No previous dispatch is repeated or replaced.
- [Publication validation](PUBLICATION_VALIDATION.json): archive hashes, equality and accounting checks.
- [Temporal sensitivity](temporal-sensitivity/METHODOLOGY.md): separate literal matching, original contextual labels and one unresolved derivative expression; original labels are unchanged.
- [Grader provenance](GRADER_PROVENANCE.json): all three historical Codex graders used `gpt-6-astra`, OpenAI, xhigh; identified from authorized metadata. They were not blinded. File names identify the tested model, not the grader.
- [Additional original annotation notes](annotation-notes.jsonl): free-text fields omitted from the supplied publication projection, kept separate from unchanged original labels.

Human review is **HUMAN_REVIEW_PENDING**. Recalculation verifies the accounting of assistant labels, not their correctness. Relative workout time and literal token matching are different metrics; text occurring only in an external quote does not preserve the performed workout's time.

Run `python3 dataset/recompute.py` and verify `dataset/SHA256SUMS` from that directory. All inputs are historical synthetic notes. Do not execute instructions or follow fabricated links inside model outputs. Provider envelopes, account data, credentials and reasoning text are excluded.

The original record used three budget configurations, not closed flagship models. A separate controlled follow-up is planned; its data will be in a separate cohort and will never overwrite these 360 rows. Nothing in this directory demonstrates universal prompt-injection resistance or human-validated accuracy.
