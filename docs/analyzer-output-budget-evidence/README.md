# Synthetic native evidence — analyzer output budget

Frozen source: `b17ba8cb32e1049622667c1b43012deebaeaa2e1`.
Obsidian 1.13.7 / Electron 43.6.0. Two synthetic Markdown notes, artificial vectors,
fresh isolated profile. The OpenRouter model ID is the requested policy under test;
**the server is loopback, not OpenRouter or a live model**. No real credentials.
HTTP fixtures are reconstructed schema-compatible responses, not the user's captured
HTTP body or private reasoning. Only the HTTP server is synthetic; product transport,
parser, session, validator, planners and final executors are unchanged real owners.

[Report and artifact hashes](report.json) · [Fixture provenance](fixture-description.json)

- [Error/consent recording](analyzer-limit-and-recovery.mp4): list → pair → explicit consent → HTTP length → no planner/retry/write.
- [Success/Apply/Undo recording](analyzer-success-apply-undo.mp4): separate fresh consent → stop + validated quotes → prepare → exact review → Apply → history → separate Undo → list.

Original-speed native screencasts. Full uncropped frames:

- [List without map](list.png)
- [RU consent: 8192 and reasoning disabled](consent-budget.png)
- [RU output-limit error and billing/retry warning](length-error-ru.png)
- [Fresh EN consent](fresh-consent-en.png)
- [Strictly validated final recommendation](validated-result.png)
- [Exact review](exact-review.png)
- [Applied result](applied-result.png)
- [History](history.png)
- [Separate Undo confirmation](undo-review.png)
- [Back to standalone list](return-to-list.png)

11 native checks passed. Two loopback HTTP POSTs, both consent bodies byte-identical
to dispatch. Zero renderer fetch/XHR attempts, no external model call. Exactly two
Markdown writes, Apply and Undo. [Before](before.json) and [after Undo](after.json)
hashes match for both notes; [after Apply](after-apply.json) records the actual change.
No fixture restoration by copying. Live model quality/completion remains NOT RUN.
