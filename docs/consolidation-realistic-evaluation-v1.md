# Knowledge Consolidation: realistic acceptance and model evaluation v1

Base: PR [#91](https://github.com/zinverno/veynrel/pull/91), merged on
2026-10-18 at 09:20:17 UTC; `main` was
`bb2036e48745e61007b10cc84fbbaed475ac2ae3` when this branch was created.
This change adds evaluation assets only. Product code, settings, version,
release files, editing mechanisms and journal contracts are unchanged.

## Decision

**Support reviewed transfers of heading/context groups before starting an
Atomization Planner.** The current chain is usable for small, self-contained
plain paragraphs: four realistic full cycles succeeded, including both canonical
directions, Unicode, CRLF, existing YAML and preserved consumers. But only 4 of
12 intended useful transfers could reach a MergePlan. Seven of the eight blocked
cases require heading, neighbouring-structure or semantic-context handling.
Atomization would need those same boundaries and would introduce more choices
before this bottleneck is addressed.

This is an engineering prioritization from a deliberately challenging synthetic
sample, not an estimate of the prevalence of these problems in real vaults.
It does not justify weakening any current protection. A future block contract
should preserve headings, attribution and dependency groups, show an exact
preview, and retain the existing fresh-read, consent, journal and Undo gates.

## Corpus and reference judgments

[`consolidation-realistic-v1.json`](../tests/fixtures/consolidation-realistic-v1.json)
contains 24 pairs / 48 saved Markdown sources (13 EN, 11 RU; case 24 is bilingual).
Every path ends in `Note.md`, in a distinct directory, so basename shortcuts are
unsafe. The native vault also has an authored register and a consumer with an
embed and frontmatter link. No personal notes, keys, downloaded corpora or paid
responses are included.

Each case records accepted relationships, exact UTF-16 source spans for unique
information, semantic/context risks, permitted recommendations, permitted
operation intent, intended canonical side and transfer ranges. The inventory
includes unique examples, context, incompatible statements and version-specific
information. Identical repeated prose is one information unit; headings and YAML
remain preservation context rather than separate recall targets. Case 18 retains
its reference inventory despite being excluded by the input gate.

The reference is **AI-curated engineering judgment, not human expert consensus**.
A second AI review checked relation/action consistency and caught the ambiguous
upper-bound example in case 11: two nested upper bounds were replaced by exact
incompatible quantities before the reference freeze. Independent human review
is **NOT RUN**. Before publishing model rankings, a human domain reviewer should
approve the reference and adjudicate response interpretations, including the
condition/version distinctions. `neverMerge` means prohibited under this
reference workflow: cases 12/20 could coexist in a differently designed document
if their conditions/epistemic status were explicitly preserved.

The [freeze manifest](consolidation-realistic-evidence/freeze.json) binds the
corpus, candidate configurations, prompts, base and relevant source files.
It precedes all live responses (none exist). Scripted controls were authored
alongside the fixtures and were used during harness development; this is not a
held-out benchmark. The final native run uses the frozen corpus.

Long cases18/19 intentionally repeat workshop/field-note structure to stress
input limits, dispersed evidence and scrolling. They are not natural long-form
writing samples and should be excluded from claims about linguistic quality.

## Scenario results

“Analysis” below means the real Analyzer session accepted a **scripted response**
after its actual request consent and production validation. It does not mean an
LLM successfully analyzed the notes. “Plan” means all intended reference transfer
paragraphs were selected through the real UI and a plan was built. It does not
count copying a shared but unhelpful paragraph just because it is selectable.

| ID | Lang | Scenario | Analysis | Intended MergePlan / reason |
|---|---|---|---|---|
| 01 | EN | Near duplicate ferry checklist | yes | No useful transfer requested |
| 02 | RU | Exact duplicate reading-club memo | yes | No useful transfer requested |
| 03 | EN | Cache theory + two museum examples | yes | Ready; full cycle; A canonical |
| 04 | RU | Counter + scoped workshop example | yes | Ready; full cycle; B canonical |
| 05 | EN | Queue workshop, H1/H2/H3 | yes | `heading` |
| 06 | RU | Decision log, H1/H2/H3 | yes | `heading` |
| 07 | EN | Code fence and explanation | yes | `neighbor` |
| 08 | RU | Ordered procedure and explanation | yes | `neighbor` |
| 09 | EN | Donor quotation and attribution | yes | `context` |
| 10 | RU | Links, embed and external source | yes | Reference forbids merge |
| 11 | EN | Same revision, incompatible exact quantities | yes | Reference forbids merge; engine refuses `conflict` |
| 12 | RU | Different morning/evening conditions | yes | Reference forbids merge; manual override can build |
| 13 | EN | Old/new retry policy | yes | Reference forbids merge; engine refuses `conflict` |
| 14 | RU | Old/new inventory procedure | yes | Reference forbids merge; engine refuses `conflict` |
| 15 | EN | Same filename, different project owners | yes | Reference forbids merge; manual override can build |
| 16 | RU | Tree branch vs repository branch | yes | Reference forbids merge; engine refuses `conflict` |
| 17 | EN | One-line notes with unresolved referents | yes | Justified abstention; engine refuses `conflict` |
| 18 | RU | 25,220-character diary | no | `tooLarge`, no completion invoked |
| 19 | EN | 15,811-character notebook, 12 dispersed protocols | yes | `heading`; all 61 source paragraphs blocked |
| 20 | EN | Hypothesis vs observation | yes | Reference forbids merge; manual override can build |
| 21 | RU | Safe existing YAML, CRLF, incoming embed | yes | Ready; full cycle; B canonical |
| 22 | EN | Table, math, footnote, HTML, block identity | yes | `protected` |
| 23 | RU | Pronoun dependency without headings | yes | `context`; further review needed |
| 24 | EN/RU | Bilingual overlap, emoji and combining mark | yes | Ready; full cycle; A canonical |

23/24 pairs reach validated control analysis. Of 12 intended useful transfer
scenarios, 4/12 (33.3%) reach a plan and 8/12 refuse. The other 11 analyzed cases
have no approved useful transfer intent; they are not “algorithm failures”.
Across the designated secondary sides, native MetadataCache yields 119 paragraph
candidates: 37 selectable and 82 blocked. First refusal reasons are 66 `heading`,
8 `neighbor`, 6 `protected`, and 2 `context`. Non-paragraph sections are listed
separately in the raw report; they are not silently counted as paragraphs.

The paragraph-weighted heading share is 66/82 (80.5%), heavily dominated by
case 19's 61 paragraphs. At the more useful scenario level, headings account for
3/8 refusals (37.5%); headings plus adjacent code/lists account for 5/8 (62.5%);
including semantic context gives 7/8 (87.5%). Reasons are the first guard reached,
not mutually exclusive explanations of all potential risks.

## Full native cycles and user effort

Cases 03/04/21/24 execute the complete existing UI chain:

`Relationship Analyzer → Merge Planner → Merge Apply → Archive Planner → Archive Apply → Archive Undo → Merge Undo`.

There are six copied paragraphs, 16 native `Vault.process` calls and eight
owned-process SIGKILL/restarts (after Archive Apply and after Archive Undo).
The write path sequence for each cycle is exactly canonical, secondary,
secondary, canonical. No other Markdown mutation API is used. All 50 realistic
notes/consumers compare byte-for-byte with their original buffers after each
cycle; original/restored SHA-256 and full before/after texts are published.
The parent Merge journal remains unchanged throughout Archive Apply/Undo.
An active archive blocks parent Merge Undo; verified Archive Undo receipts permit
it after another restart. These are completed-operation restarts; the separate
[Archive Apply fault matrix](archive-apply-native.md) remains the evidence for
interruption at journal/write boundaries.

| Case | Transfer paragraphs | Analyzer-to-plan confirmations | Residual fragment decisions | Full-cycle confirmations |
|---|---:|---:|---:|---:|
| 03 | 2 | 4 | 1 | 10 |
| 04 | 1 | 3 | 2 | 10 |
| 21 | 1 | 3 | 4 | 12 |
| 24 | 2 | 4 | 1 | 10 |

Counts include Analyzer request consent, each paragraph's context checkbox,
insertion consent, each residual fragment disposition, archive limitation
acknowledgment, and the four Apply/Undo confirmations. They exclude navigation,
opening review windows, choosing canonical/location/status, and clicking Build.
Every residual fragment was explicitly classified as **retained in secondary**;
the test does not assert that successful copying proves redundancy.

Per-case automated inspector-open → plan/refusal wall time is recorded in
[native-report.json](consolidation-realistic-evidence/native-report.json).
It is a machine interaction lower bound, excluding discovery ranking, human
reading/decisions and model latency. It must not be described as human completion
time or used as a UX productivity claim. The raw run contains both successful
paths and deliberate read-only manual-override probes.

Native runtime: Obsidian 1.13.7 / Electron 43.6.0, isolated Linux synthetic vault.
RU/EN, both built-in themes, 1200/390px desktop viewports, full archive before/after,
diff, keyboard Enter confirmation, refusal screens and restarted Undo are covered.
390px is desktop emulation, not physical mobile acceptance. No independent
process races, other OS, screen reader or custom theme acceptance is claimed.

## Model evaluation: what is measured and what is not

The harness imports the **production prompt, request-body builder, limits and
response validator** through a test-only bundle. It does not introduce an
alternate product analyzer. Node's offline Obsidian adapter throws on network.

Metrics deliberately separate:

1. JSON syntax/shape, including required quote sides and contract dimensions.
2. Production acceptance: exact unique quotes plus internal relation/action consistency.
3. Reference relationship agreement, false merge recommendations (including
   alternatives), false `conflict` claims, required/justified abstention,
   reference action policy, and unsupported `consider_atomize` recommendations.
4. Typed literal coverage of reference information spans: a **proxy**, not proof
   that the model understood a quoted fragment. Version/conflict evidence is
   distinguished from unique/context/standalone evidence.
5. Optional response- and corpus-bound human adjudication of every claim, with
   correct/incorrect/uncertain verdicts and explicitly matched information IDs.
   Semantic precision and recall remain null until adjudication. Uncertain
   verdicts stay in the precision denominator; missing judgments are not dropped.

The curated control replay has 23/23 shape-valid, production-accepted responses
and 65/65 exact quotes; its relation labels match by construction. Nevertheless,
it covers only 27/81 reference information units under the typed literal proxy.
This is **not model performance**: the scripted controls intentionally contain
only selected observations. Case 19 alone needs twelve widely separated station
observations, while the contract allows only eight claims, including shared
evidence, and 1,200 characters per quote. A valid response can be incomplete.

Negative unit controls prove that a grounded but wrong relation, false merge
recommendation and false contradiction can pass production validation and still
fail reference scoring. Invented quotes pass shape checking but fail grounding;
missing required quotes fail shape. Abstain-all is structurally valid yet has
justified-abstention precision 1/23. No semantic-quality number is inferred from
valid JSON or byte-exact quotes.

| Candidate configuration | Temperature / output cap | Live status | Semantic quality |
|---|---|---|---|
| `openai/gpt-4.1-mini` | production defaults: 0 / 4,000 | NOT RUN | unmeasured |
| `anthropic/claude-sonnet-4` | same | NOT RUN | unmeasured |
| `google/gemini-2.5-flash` | same | NOT RUN | unmeasured |

These are candidate IDs, not claims of current availability or pricing. The
[configuration file](../tests/fixtures/consolidation-model-profiles.json) supports
reproducible comparison; there is no winner and no paid authorization. Imports
must match corpus/prompt hashes; missing cases remain visible. Comparisons flag
unequal case coverage rather than silently ranking different subsets.

The source-level action `consider_merge` is available, but its recommendation
does not prove a specific transfer is executable. Seven of eleven scripted
merge recommendations lead to blocked intended transfers. The native matrix is
conditional on these controls: external models may produce different context
hints, so it is not automatically reusable as their per-response plan score.

## UX findings and next work

- **Safe but unusable for structured knowledge:** cases 05/06/19 cannot copy any
  desired example because headings precede it. Cases 07/08 need code/list context;
  case 09 needs quotation attribution. These are useful consolidation candidates
  that the current contract correctly declines.
- **Safety versus semantics:** cases 12/15/20 produce `related_distinct`; a user
  can still build a manual copy plan. The real write executors never certify
  semantic appropriateness. Report this affordance clearly before expanding
  operations; this PR records the behavior without changing the policy.
- **Review cost grows with source structure:** case 19 renders 61 disabled
  paragraph choices, yet cannot form a useful plan. Case 21 requires four residual
  decisions, including preserved frontmatter context. A safe future UI should
  summarize refusal reasons early and group related review material.
- **Narrow screens require considerable reading:** paths, operation hashes,
  scope warnings and full text occupy several screens at 390px. Overflow checks
  pass; that is not evidence of fast or effortless human review.
- **Analyzer coverage is unproven:** prompt/claim caps, version distinctions and
  quoted context need separately authorized model runs plus human adjudication.
  Do not begin atomization by treating missing claims as absent knowledge.

Recommended order: human review of this reference → bounded model comparison →
heading/context-group plan design with preservation tests → native usability
review → reconsider Atomization Planner. This PR changes none of the guards.

## Reproduce and interpret

```sh
npm ci
node scripts/consolidation-evaluation.mjs offline /tmp/control-report-new.json
npm test -- tests/consolidationEvaluation.test.ts
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-realistic-NEW --realistic-consolidation
```

The native root must not exist; it creates only synthetic files and its own
profile. It requires the installed Obsidian/Electron desktop used by the existing
harness and an available CDP port 9274. `realistic-progress.json` retains completed
case evidence if the native run fails. Nothing is copied into a real vault.

For externally collected answers, import a file containing `profile`,
`corpusSha256`, `promptSha256`, and `items:[{caseId,raw}]`. `raw` is the unedited
response string. Record truncation and provider provenance alongside it; the
importer does not authenticate that provenance. It scores malformed responses
without repairing them. Then:

```sh
node scripts/consolidation-evaluation.mjs import /tmp/model-a-score.json /tmp/model-a.json
node scripts/consolidation-evaluation.mjs compare /tmp/comparison.json /tmp/model-a.json /tmp/model-b.json /tmp/model-c.json
```

Optional adjudication is `{corpusSha256,cases:{"03":{responseSha256,reviewer,
complete:true,claims:[{id,verdict:"correct",uniqueIds:["03-u1"]}]}}}`. Every
response claim must appear once. Pass its filename after the response filename
to `import`; verdicts may also be `incorrect` or `uncertain`. A changed corpus
or response invalidates the judgments. Correct prose interpretation requires
reading both complete sources, not just agreeing with an automatic quote match.

## External opt-in and spending boundary

**Do not run the live command without a new, separate user authorization.**
Default/offline/native/npm-test paths never call a provider or read real keys.
The live runner accepts only the fixed HTTPS OpenRouter endpoint, three or more
pinned configurations, approved case IDs, exact corpus/prompt/config hashes,
an expiry, a single absolute run directory, request ceiling and dollar ceiling.
`maxRequests` counts completion requests; the run also makes exactly one bounded
key-information GET before them. Neither operation is retried.
The authorization template below is deliberately disabled:

```json
{
  "approved": false,
  "purpose": "Veynrel synthetic Relationship Analyzer evaluation",
  "runId": "human-approved-run-001",
  "runDirectory": "/tmp/veynrel-evaluation/human-approved-run-001",
  "corpusSha256": "COPY_FROM_FREEZE",
  "promptSha256": "COPY_FROM_FREEZE",
  "profilesSha256": "COPY_FROM_FREEZE",
  "expiresAt": "REQUIRES_NEW_USER_APPROVAL",
  "dedicatedUnusedKey": true,
  "noBYOK": true,
  "caseIds": ["03"],
  "maxRequests": 3,
  "maxUSD": 0,
  "reservePerRequestUSD": 0,
  "maxPromptUSDPerMillion": 0,
  "maxCompletionUSDPerMillion": 0
}
```

Amounts and price limits must come from that future approval, not this template.
Use an otherwise unused dedicated key with a non-resetting provider cap no larger
than the approved total; no BYOK. The key is read only from
`VEYNREL_EVAL_OPENROUTER_KEY` after authorization validation and is never written
to reports. Run root must already exist and match the approved canonical path.
The explicit command is:

```sh
node scripts/consolidation-evaluation-live.mjs --allow-paid /private/approval.json /tmp/veynrel-evaluation
```

Exclusive creation of the approved run directory prevents concurrent/repeated
use of that authorization through another root. Each request gets a stable ID
and a complete persisted reservation before HTTP. Reservations are never recycled
within the run. Short writes, expiration, missing/excess cost receipts, transport
failure or interrupted runs stop the batch; there is no resume, retry or automatic
billing reconciliation. Keep the directory and receipts for manual inspection.
Tests simulate these faults without real HTTP. The evaluation ledger is separate
from, and does not read or alter, product operation journals.

Provider caps and routing price limits are additional controls, **not a claim of
absolute billing protection** against provider behavior or independent consumers.
The input-byte estimate plus overhead is conservative for ordinary text models,
not a tokenizer theorem. Real availability, routing and billing were not tested.
The runner adds explicit accounting/routing constraints to the otherwise exact
production chat body; this can reduce provider availability.

Primary API references used for this implementation:
[current key limits](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key),
[provider routing and maximum prices](https://openrouter.ai/docs/guides/routing/provider-selection),
[usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

## Evidence and validation

- [Frozen reference](consolidation-realistic-evidence/freeze.json)
- [Offline control report](consolidation-realistic-evidence/control-report.json)
- [Native report, complete cycle before/after and byte hashes](consolidation-realistic-evidence/native-report.json)
- [Native screenshots and run notes](consolidation-realistic-native.md)

Local validation passes: **3,656 tests /141 files**, typecheck, lint (only the
existing reviewed streaming-fetch advisory), build, `audit:proposals` (5/5
mutations killed) and `git diff --check`. A full suite run alongside heavy
checks first hit existing five-second import timeouts; the isolated final run
passes without timeout or assertion changes. GitHub CI is checked on the PR's
exact head after publication. Paid model quality and independent human
adjudication remain explicitly NOT RUN.
