# Recommendation → checked plan

Dependent change from PR #110, `4841de51203403309458c301e436530a2c102c78`.
The analyzed result previously opened an empty action catalogue, and changing the
source cleared the operation. The pair UI now passes a typed, unauthorized intent
to the existing planner session. The standalone review list still mounts no map.

## Routing and remaining decisions

| Validated recommendation | Existing scenario | Required decisions |
| --- | --- | --- |
| `add_link` | Single-file link | Direction, native paragraph anchor, explicit confirmation |
| `consider_embed_b_in_a` | Embed in A | Eligible paragraph and confirmation |
| `consider_embed_a_in_b` | Embed in B | Eligible paragraph and confirmation |
| `consider_merge` | Combine material | Primary note, eligible material, destination and context confirmations |
| `consider_atomize` | Atomization preview | Standalone part, title/path and context checks; writing to an existing empty target remains a separate explicit choice |
| `no_change` | Finish without a planner | No write decision |
| `manual_review` | Inspect comparison/evidence | No automatically selected edit |

The primary recommendation, complete reason and concrete effect precede common
material and differences. The CTA names the scenario. Explanation, citations,
alternatives and limits remain expandable without shortening model caveats.
“Another option” lists actual model alternatives first, then user intentions.
Reciprocal links and writing an atom to an existing empty note are explicit user
choices with their own effects. They are never inferred from a one-way link or a
preview recommendation.

`recommendationIntent` carries family, origin, reason, evidence IDs, known
source direction, missing parameters, availability and refusal reasons. Local
capability checks run after the existing session freshly reads native metadata.
`needs_input` is not a plan or execution authority. `draft_ready` is used for the
two non-edit routes only. No request, consent flag, serialized operation or ticket
is created by the adapter. Planner ownership and freshness checks remain in
`ChangePlannerSession`; final review stays with the existing executor.

The read-only `requireChangeRange` check was extracted from the existing builder,
without changing conditions or order, so both the form and builder reject
protected/evidence-ineligible paragraphs, existing links and embed cycles. Ranges
come from MetadataCache, never LLM offsets. Direction changes clear range and
confirmation while preserving the action family. Quotes remain hints; ambiguous
matches do not nominate transfer boundaries.

## Combining material, honestly

A primary-note choice checks three existing capabilities:

- **Merge:** copy explicitly selected standalone plain paragraphs at a confirmed
  native paragraph anchor. Context/heading/neighbour restrictions remain.
- **Group:** copy a supported original heading branch with its explicit context,
  hierarchy, dependency review and EOF destination checks.
- **Bundle:** copy a supported code/list/quotation unit with its separately chosen
  context, boundary review and checked EOF destination.

If exactly one representation is supported, it is proposed without confirming
any material or insertion. If several are supported, the user chooses the kind
of material. Unsupported directions explain each refusal before empty fragment
forms or a build action. Conflicting/unsupported analysis still refuses copying.
All original builders validate again; capability hints cannot authorize a write.

These are bounded copies into the primary note, **not arbitrary whole-file
merging or semantic deduplication**. The entire secondary remains unchanged.
Nothing is automatically deleted or archived. Existing Archive eligibility and
Archive Undo → Parent Undo order are untouched. Model provenance remains the
original validated analysis even when the user chooses a different intention;
the UI labels that deviation. No writer, ticket or journal schema was changed.

## Verification

The regression traverses an actual chat-completions transport parser, strict
validator, result action, adapter, existing planner and literal exact review.
Coverage includes both embed directions, shared-plus-unique protection, existing
links, explicit ranges/confirmations, model alternatives and user deviation,
Merge/Group/Bundle capability checks, early structural refusal, standalone
atomization preview, no-change/manual routes, stale settings/buttons, double
click, metadata invalidation, closed owners, length completion and invalid quotes.
Existing planner/executor/safety tests remain enabled. A previous UI expectation
of an empty catalogue was replaced by the directed embed route while retaining
its exact-diff, confirmation, invalidation, no-write and late-button assertions.

Native harness: `scripts/recommendation-to-plan-native.mjs`. It creates a fresh
isolated four-note synthetic vault and an artificial semantic index. A loopback
HTTP server supplies validated link, merge and unsupported-structure responses.
No completion/result function is replaced: native `requestUrl`, parser, validator,
planner, exact review, Apply, history and separate Undo are exercised. Each consent
body must equal the actual request byte-for-byte. Preparing a recommended action
must not send another request. Markdown SHA256 is checked before, after Apply
and after actual Undo; no copying/restoration bypasses an executor.

Native evidence covers RU/EN, built-in dark/light, desktop and 390 CSS px, with two
recordings and an early-refusal frame. The script asserts no graphical workbench
construction or semantic map loading. Artificial vectors and synthetic model
responses test integration, not model quality. Frozen build identity, counts and
recordings are recorded in the accompanying evidence after the final run.

Not run: paid/live-model requests, physical mobile, screen reader, third-party
themes, personal or TEST vault installation. Prior map A/B and wider UX acceptance
remain separate. No next product stage is started.
