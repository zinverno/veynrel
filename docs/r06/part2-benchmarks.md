# R06.2a measured controls

One attempt per registered case; no confidence intervals, human productivity or
real embedding-quality claims. Source/asset/harness hashes and exact timestamps
are in the linked unmodified receipts. Picker controls use the same source path,
fixture and warm host-cache sequence. Candidate alone explicitly loads its existing
participation rules; this cost is included in selection time. Both leave semantic
and topology owners idle and Markdown IO/network at zero.

## Isolated second-note picker

DOM is the selected-note detail subtree, not the entire window. Heap is one renderer
`usedJSHeapSize` sample, not peak memory or a controlled allocation delta. Search time
includes CDP delivery and rendering, not a pure string-function microbenchmark.

| Attempt | Result | Picker DOM / options / results | Select ms | Exact-path search ms | Heap MiB |
| --- | --- | --- | --- | --- | --- |
| [picker-before-1000](evidence/part2/native/picker-before-1000/report.json) | PASS | 1015 / 1000 / 0 | 119.10 | not reached | 69.78 |
| [picker-before-5000](evidence/part2/native/picker-before-5000/report.json) | FAIL | 5015 / 5000 / 0 | 514.04 | not reached | 60.33 |
| [picker-before-10000](evidence/part2/native/picker-before-10000/report.json) | PASS | 10015 / 10000 / 0 | 907.54 | not reached | 104.70 |
| [picker-after-1000](evidence/part2/native/picker-after-1000/report.json) | FAIL | not reached | not reached | not reached | not reached |
| [picker-after-5000](evidence/part2/native/picker-after-5000/report.json) | PASS | 65 / 0 / 20 | 210.13 | 3.88 | 56.16 |
| [picker-after-10000](evidence/part2/native/picker-after-10000/report.json) | PASS | 65 / 0 / 20 | 164.24 | 4.37 | 91.81 |

Before-5k reached the selector but failed on unfiltered host `e.isShown`. After-1k
failed the initial window/document focus gate before UI; no result is imputed.
The 10k subtree fell from 10,015 elements / 10,000 options to 65 / 20 buttons, with
9,999 eligible matches reported and the last exact path selected by keyboard.
This establishes the DOM bound on 5k/10k; it does not establish peak-memory gains.
The production path and DOM contract also have deterministic 1k/5k/10k unit cases.

## Full map / cap / rendering

These are a separate registered protocol, not substitutes for picker failures.
`semanticMs` measures the existing owner's start-to-settled interval; above cap it
is validation/refusal, not a completed all-document similarity calculation.
`layoutMs` is model initialization; `displayGroupingMs` is technical path grouping.
No semantic families are computed for a cap-refused scope.

| Attempt | Result | Host cache ms | Scoped / indexed / semantically computed | Nodes / display groups | Owner ms | Layout / display grouping ms | DOM / SVG |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [before-warm-1000](evidence/part2/native/before-warm-1000/report.json) | PASS | 3,985.76 | 1000 / 1000 / 0 | 0 / 10 | 132.30 | 12.50 / 1.90 | 101 / 38 |
| [before-warm-5000](evidence/part2/native/before-warm-5000/report.json) | FAIL | 17,111.72 | 5000 / 5000 / 0 | 0 / 50 | 1,830.60 | 52.00 / 22.00 | 221 / 118 |
| [before-warm-10000](evidence/part2/native/before-warm-10000/report.json) | FAIL | 44,166.70 | 10000 / not reached / not reached | not reached | not reached | not reached / not reached | not reached |
| [before-cold-10000](evidence/part2/native/before-cold-10000/report.json) | FAIL | not reached | 10000 / not reached / not reached | not reached | not reached | not reached / not reached | not reached |
| [after-warm-1000](evidence/part2/native/after-warm-1000/report.json) | FAIL | not reached | 1000 / not reached / not reached | not reached | not reached | not reached / not reached | not reached |
| [after-warm-5000](evidence/part2/native/after-warm-5000/report.json) | FAIL | 11,054.82 | 5000 / 5000 / 0 | 0 / 50 | 2,040.20 | 41.50 / 8.30 | 224 / 118 |
| [after-warm-10000](evidence/part2/native/after-warm-10000/report.json) | FAIL | 28,409.21 | 10000 / 10000 / 0 | 0 / 64 | 6,991.90 | 134.70 / 32.10 | 266 / 146 |
| [after-cold-10000](evidence/part2/native/after-cold-10000/report.json) | FAIL | not reached | 10000 / not reached / not reached | not reached | not reached | not reached / not reached | not reached |

Cold-open host-cache timeout remains 90 seconds: baseline 3,323/10,000 and candidate
3,442/10,000 known entries; semantic and layout phases were not reached. Warm baseline
10k reached 10,000/10,000 metadata, then timed out on `!wb.data.busy`; the receipt
does not separate the pending owner. It also contains three host exceptions.
Candidate warm 10k reached cap refusal, 64 technical display groups, exact search
and bounded picker; its whole run remains FAIL due to one host exception.
No timeout was raised; no ANN or cap change was made.

| Full-map attempt with metrics | Four link-layer toggles ms | Sampled rAF intervals: count / median / max ms |
| --- | --- | --- |
| [before-warm-1000](evidence/part2/native/before-warm-1000/report.json) | 246.32 | 15 / 16.70 / 16.70 |
| [before-warm-5000](evidence/part2/native/before-warm-5000/report.json) | 402.63 | 18 / 16.70 / 66.60 |
| [after-warm-5000](evidence/part2/native/after-warm-5000/report.json) | 607.57 | 22 / 16.70 / 83.30 |
| [after-warm-10000](evidence/part2/native/after-warm-10000/report.json) | 1,320.90 | 20 / 16.70 / 300.00 |

These rAF intervals are a short in-harness sample under Xvfb/disabled GPU, not
physical compositor/frame-presentation measurements. Raw topology capture/derivation,
refresh, search, heap and frame counters are retained in receipts. Grouping CPU time
for the tentative-family projection was not separately isolated.

## Small family controls

The 12-note fixture computes 12 semantic documents and represents eight unique notes
in three overlapping cores. No technical display groups are needed. The intermediate
`family-delivery` build passed all 27 assertions; final presentation-only `family-final-ui`
passed 26 assertions before the strict exception guard failed on host `e.isShown`.
Separate post-run validation proves unchanged fixture bytes; it does not change FAIL
to PASS. Final uncropped images and continuous video document the actual final UI.
