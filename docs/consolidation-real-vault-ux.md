# Consolidation real-vault UX and Analyzer fixes

Base: `0df3167977a2a255b0faaaca998fdfa593d2971c` (merged PR #103). Version unchanged.

| Area | Before | After |
| --- | --- | --- |
| Potential Duplicates | Width applied to content inside a narrower native modal; adjacent actions; long excerpts | Dedicated outer modal, up to 1000 px and viewport bounded; 12 px action spacing; independently scrollable notes; expandable complete excerpts; one column at narrow desktop widths |
| Pair Inspector | Repeated introduction and many metadata disclosures before analysis | Short consent boundary, actions, sources; metadata grouped under one disclosure per note; complete existing preview and exact-note navigation retained |
| Analyzer consent | Expanded JSON and repeated warnings | Provider, model, paths, actual byte size and one privacy/billing warning; closed exact payload and endpoint disclosure; dedicated action footer |
| Diagnostics | Generic transport failure | Timeout, abort, network, HTTP, provider failure, empty output, invalid envelope, strict schema, evidence and inconsistent recommendation categories; no raw response/header/error details |
| Apply / Undo | Adjacent buttons after potentially long previews | Wrapped action bars with 12 px gaps and sticky footer; unchanged consent callbacks and executors |

The Inspector still describes saved files, not unsaved editor buffers. Its existing 12,000-unit preview bound and metadata list limits remain explicit; opening the exact note gives access to the complete Markdown. No executor, journal format, recovery protocol, semantic search algorithm or unsupported-structure policy changed.

## BUG-01

`CallOptions.timeoutMs` controls buffered waiting at the call site. Only `RELATIONSHIP_OPTIONS` selects 120,000 ms; other callers retain 30,000 ms and streaming remains unchanged. Timers and abort listeners are cleaned; the existing race keeps handlers attached to late transport completion. There is no retry.

The official [Obsidian requestUrl API](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) exposes no abort signal or cancellation method. Stopping local waiting therefore does not establish provider cancellation or absence of billing.

Controlled promises and fake timers verify a successful full response at 38.6 seconds, pending state through 119.999 seconds, timeout at 120 seconds, one request per consent, and suppressed late output. Existing API tests retain the default 30-second, abort and late-rejection coverage.

## BUG-02

`tests/fixtures/relationship-unique-embed-regression.json` reconstructs the reported failure shape with newly authored SQL notes. It is **not** a captured private response. A `partial_overlap` / `consider_merge` response whose embed alternative cites only `unique_b` claims c6/c7 is rejected. An explicitly corrected fixture citing its actual shared claim c1 is accepted; a fabricated c1 quote is still rejected. No response repair is performed.

The prompt now states that every primary and alternative recommendation independently needs the appropriate evidence in its own list. The validator's evidence rules are unchanged.

## Validation and native acceptance

Automated evidence is recorded in the PR checks. The dedicated 1000-note lab PR records actual native screenshots, functional and performance results in `docs/real-vault-acceptance-v2.md`. The fixed build is to be installed only in that synthetic lab; no original vault settings or API keys are copied. Until those native results exist, this document makes no native visual PASS claim.

No paid provider call, release, version bump or auto-merge is part of this change. A larger timeout addresses the observed timing failure; it does not prove the supplied model will consistently satisfy the strict evidence contract.
