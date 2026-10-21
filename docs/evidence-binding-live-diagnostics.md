# Relationship Analyzer: fragment IDs and claim IDs

The first authorized live diagnostic reproduced `explanation.evidence → evidence_unknown`. Both values in that list existed in the exact submitted fragment catalogue, but neither existed in the response's `claims[].id`. The recommendation's claim references were valid. This is observed namespace confusion in the new reproduction, not an inference from the earlier private case or an assertion about unrecorded historical snapshots.

The strict validator correctly refused the result. The narrowly scoped fix makes the two namespaces explicit in the product prompt, presents claims before conclusions, identifies every field that takes claim IDs, and confines the prohibition on invented fragment IDs to fragment references. The wire schema, adapter, strict validator and diagnostics are unchanged. Invalid replies are still rejected; no ID guessing, response repair, claim deletion or automatic retries were introduced.

## Authorized live run

Existing TEST settings selected OpenRouter `deepseek/deepseek-v4-flash-0731`. The provider, model, 8192-token ceiling and disabled-reasoning policy were preserved. Only the two expressly authorized saved Markdown files were copied into a private isolated Obsidian profile. Their content hashes matched before each dispatch and after the run. TEST itself was read-only, with no installation, Apply or archive operation.

Each request used the real `RelationshipSession.prepare/confirm`, product prompt/body builder, native Obsidian `requestUrl`, `callOpenRouter` response parser, frozen-catalogue adapter and strict validator. A local diagnostic-only wrapper at the transport boundary compared the disclosed and sent body byte for byte, reserved cost durably before native HTTP, and captured the response/usage receipt. The wrapper invoked a bundle of the unchanged product transport module; it did not supply a different prompt or a prevalidated analysis. Native `PairReview` retained ownership of the session and planning transition. This instrumentation is outside the shipped plugin.

| Request | Product prompt | Result | Actual USD from `usage.cost` |
| --- | --- | --- | ---: |
| 1 | Before correction | Rejected: fragment IDs in `explanation.evidence` | 0.000462786848 |
| 2 | Corrected | Strictly validated; `add_link` | 0.000584392464 |
| 3 | Corrected | Strictly validated; `consider_merge` | 0.000435367368 |

**Total: $0.001482546680 / $0.10; 3 / 8 requests. Remaining: $0.098517453320.** Requests 2 and 3 are consecutive successful live analyses, with separate freshly prepared catalogues and consents. All three ended with `finish_reason: stop` and zero reported reasoning tokens. No further paid requests were made.

Before every dispatch the wrapper fetched current [model endpoint tariffs](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints), included all listed price overrides, ignored cache discounts and doubled the largest input/output tariffs. The input bound was the complete serialized UTF-8 body size plus 1024 framing tokens; output was bounded by the unchanged 8192 limit. Reservations were $0.058549921, $0.059502960 and $0.059502960, each checked against the remaining budget before sending. Costs were accounted upward to nanodollars; unknown/unsettled billing or an over-reserve receipt blocks the next request. These are conservative diagnostic reservations, not estimated bills. Actual bills above come from the provider's [usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

Request 3's primary action opened the existing combine scenario in `choosing` state, with canonical-note selection and no generic action catalogue. The paid-request count stayed at three; the transport was explicitly blocked before this transition. No change was applied. Request 2's planning check was interrupted when the isolated native process exited, so its live planning transition is **not claimed as verified**. Its successful parsed/validated result and billing receipt were already saved locally.

Private requests, responses, credentials, Markdown, identities and UI images are not committed or published. Public regressions use unrelated synthetic cache-note content. Product code does not acquire diagnostic logging or billing machinery.

## Regression and limits

Transport regressions feed normal `stop` envelopes through `callOpenRouter`, the evidence adapter and strict validator. Fragment IDs in explanation, primary recommendation and alternative claim lists all fail closed, leave no analysis authority, preserve the reply, send exactly the consent body and do not retry. A separately generated valid claim-reference response succeeds. Existing output-limit, stale-source, cancellation, planner and safety checks remain intact.

The initial unrestricted concurrent test run had 16 failures (mostly 5-second timeouts); it is not a passing result. The suite was rerun with two workers and unchanged assertions/timeouts: **4667 tests / 170 files passed**. Both typechecks, lint/build, proposal audit 5/5, installer fixtures and diff check also pass. An initial lint failure in a new test matcher was corrected without changing the tested behavior. The [separate synthetic native executor recording](evidence-binding-namespace-evidence/README.md) has 22 checks and restores all Markdown hashes after the real Apply/Undo route.

Two successful responses establish that this failure was corrected for the authorized diagnostic run, not that future model output is guaranteed valid. The two recommendations differ (link versus combine); schema/evidence validation is not a guarantee of semantic correctness or stable action choice. Fragment coverage remains bounded and disclosed. Unsupported structures still refuse planning. No personal-note executor test, live quality benchmark, other-model sweep, map redesign or product automatic retry was performed.
