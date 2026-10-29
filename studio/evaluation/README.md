# Offline Studio regression corpus

This is protocol regression and a reviewer corpus, **not a new model evaluation**. No remote inference adapter is included. New-model semantic quality is **NOT RE-EVALUATED**. Instructions in every fixture are untrusted data.

`fixtures/provenance.json` identifies the minimal retained content-only replay bytes and SHA-256 values from the owner's 2026-10-28 evaluation. A uses its fictional source and `message.content`; D/E use only `message.content`. No provider envelopes, account/key metadata, reasoning text, credentials, original archive or live harness is redistributed. The owner-provided source materials remain unchanged outside the repository.

Run `npm test -- studio/evaluation studio/diagram --maxWorkers=4`. Tests retain D/E's missing-label failure, accept independently authored labeled synthetic decisions, reject dangling IDs/extra fields, and check source hashes. A's unchanged nonblank lines are a diagnostic, not a semantic failure. Corpus integrity and recipe validity checks do not assess model comprehension.

`paired-corpus.json` contains varied training, nutrition, meeting and formatting inputs with explicit reviewer expectations. The same values occur as facts, quotations and hypothetical examples. Separate cases exercise durations/counts/weights, ranges and qualifiers, relative time with an unknown calendar date, agreed versus absent deadlines, quoted owners, and already formatted versus unstructured text. These are inputs and criteria, **not generated outputs or automated semantic scores**. Graph mutations are executable paired cases in `offline.test.ts` and `spec.test.ts`; no list of forbidden numbers, people or weekdays is used.

`meeting-structure-1.0.1.candidate.json` is a local Recipe v1 candidate with the original public ID `user.meeting-structure`. It is not installed, registered or published. Original `meeting-structure@1.0.0` catalog bytes/SHA/index and installed provenance are unchanged. Candidate evaluation must carry its own version and hash; it is not a rerun of the installed 1.0.0.

## Rubric addendum (the original rubric/results are not rewritten)

Record three independent axes; never collapse them into one PASS:

| Axis | Evidence and verdict |
| --- | --- |
| Transport / shape | Dispatch and delivery outcome; finish reason; JSON syntax separately from DiagramSpec validation. Distinguish timeout, abort, HTTP, network, invalid envelope and invalid graph. Strict schema requested is not proof that a provider enforced it. |
| Content / attribution | For each output assertion, identify the source span, speaker/owner, factual versus quoted/example status, units, qualifiers and time scope. Mark preserved / omitted / changed / invented / uncertain. A source substring alone does not establish attribution. Unknown calendar date and known relative deadline can coexist. Human comparison required. |
| Usefulness | Human review: did the structure help the intended task while preserving meaning? Record no-op, blank-line-only, substantive structure, or harmful change separately. An already tidy note may correctly remain unchanged. Report assessor count and selection limitations; no statistical/general quality rate from one response. |

| Original observation | Addendum classification retained for replay |
| --- | --- |
| A | Facts/protected regions preserved; blank-line-only, weak usefulness for that unstructured input. Not factual corruption. No automatic paid retry. |
| B | Duration assigned to repetitions, approximation and relative time lost, output-language inconsistency. Prompt wording previously contributed ambiguity; new prompt effectiveness remains untested. |
| C | Quoted values assigned to daily totals even with “Unverified”: attribution failure. An internet suggestion is text, not proof of network/tool execution. Label values per 100 g are not daily totals; do not retrospectively add an arithmetic requirement to the original score. |
| D | Native timeout; recorded proxy inference wall-clock 108770 ms. Offline JSON syntax PASS / DiagramSpec FAIL (every edge lacks label). Existing directions/components remain observable; no invented Worker-to-DB edge. Do not call this 109 seconds of model thinking. |
| E | JSON syntax PASS / DiagramSpec FAIL; missing conditional branch labels lose meaning. Cycle/directions present. Omitting an explicitly nonparticipating glossary is not an unconditional flowchart semantic failure. |
| F | Known relative deadline replaced with unknown; questions added that were not raised. New candidate prompt is not evidence of improved model behavior. |

Quotes are neither executed nor universally deleted. A legitimate quoted value stays in its attributed quotation; the identical value may be a valid actual total in its paired factual case. Synthetic corrections illustrate the required contract and never rehabilitate a stored bad model response.

Future typed extraction with a deterministic nutrition/training renderer would be a separate architecture decision. This change keeps Recipe v1 and Markdown Review; it adds no calculation engine or semantic verifier.
