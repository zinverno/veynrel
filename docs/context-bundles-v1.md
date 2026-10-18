# Contextual Block Bundles v1

A separate **read-only** `ContextBundlePlan` previews a complete code/example, list/context, or quotation/attribution bundle. A block and its qualifying paragraphs remain verbatim and in source order. The secondary note is unchanged. No Apply, Undo, journal format, background task, model request or setting is added.

Base: PR #93 was verified merged into current main `52a31f506d32ea70510edf368cf0122fd96b1250` before creating `feat/contextual-block-bundles-v1`. Existing MergePlan and GroupPlan validation, executors, journals and recovery are unchanged.

## Supported boundary

This first version deliberately supports **one structured core in a heading-free source**, surrounded by ordinary paragraphs, and a **heading-free, plain canonical**. Neither source may have frontmatter. The user selects every surrounding context paragraph separately; none starts checked. Omitting even one paragraph refuses the plan. This preserves the complete local scope, including repeated shared prose, rather than deduplicating or rewriting it.

| Kind | Local structural proof | User review still needed |
|---|---|---|
| `code_explanation` | One whole closed, unindented backtick/tilde fence; simple optional language; nonempty body; matching closing fence; plain paragraphs on both sides | Purpose, applicability, usage conditions and counterexamples; code correctness/security is not checked |
| `list_context` | Whole unindented flat list; one line per item; identical unordered marker or consecutive ordered `1..n`; exact native item ranges and root parent | Introductory scope, complete order and dependent conclusion |
| `quotation_attribution` | Whole simple blockquote; every line explicitly starts `> `; plain paragraphs immediately before and after | Immediate attribution and claim status/scope; copying an attributed observation does not establish its truth |

Lists with tasks, nesting, omitted numbering, complex continuations or incomplete native item records refuse. Quotes containing nested quotes/lists, indented code, thematic breaks, callouts, lazy continuation or rich markup refuse. Links, embeds, tags, footnotes, block IDs, reference definitions, known external addresses and rich context refuse. All native list-item records must have valid bounds and belong to a list section; unrelated corrupt records cannot be silently filtered away. Code literals resembling dependency syntax are conservatively rejected too; code is never executed.

Native section coverage and saved Markdown must agree, including whitespace gaps. Core ranges must start and end on source line boundaries. The copied envelope includes the original separators between all selected blocks. Native offsets and serialized ranges are UTF-16, not UTF-8 byte offsets. Original Unicode, combining characters and CRLF are not normalized.

Several structured cores, source headings, properties, or a structured/heading-scoped destination need a future explicit dependency policy. No parent chapter is automatically copied; no heading is added or relevelled. Prose-only adjacency is not a fourth bundle type. Nonempty ordinary paragraphs are required on both sides even when a reader might consider a simpler example sufficient.

## Review and plan contract

Choose canonical A/B, kind and exact structural candidate. The UI shows both complete saved sources, known resolved/unresolved references, Analyzer claims as hints, ordered core/context ranges and ranges retained only in secondary. A repeated literal is distinguished by its offset. Select each context paragraph and independently confirm boundaries/order, context roles, dependencies and insertion. Unresolved dependencies block Build. `related_distinct` additionally requires deliberate-copy intent and retains its original recommendation; conflict, unreviewed version claims, unrelated and insufficient-context analyses refuse.

The only destination is explicitly chosen **EOF outside all heading regions**. Two visible canonical-style newline characters precede the exact source envelope. Full canonical before/after and a text-only diff show that insertion, including duplicated shared scope. All characters inside the bundle remain unchanged. Source strings and JSON are text, not rendered Markdown or executable HTML.

The serializable version-1 `copy_context_bundle` contract stores:

- Explicit kind, `readOnly: true`, exact paths, saved identities (ctime/mtime/size and a noncryptographic content fingerprint), complete originals and canonical after.
- Core, each ordered context block, exact envelope and retained ranges, plus exact insertion point/separator/splice.
- All user choices/confirmations, native metadata, known incoming/outgoing dependencies and resolver results.
- Validated original Relationship Analyzer response/provider/model and explicit semantic/external-completeness limitations.

`validateContextBundlePlan` reconstructs and compares the entire contract. This is a preview validator, **not** a durable operation validator, signature or write authorization. There is no conversion into MergePlan, add_link or any executor operation.

## Freshness and lifetime

`ChangePlannerSession.buildBundle()` uses the existing read-only two-note boundary. It rereads both sources before building, then rereads both again before publication. Each comparison checks exact path, TFile object identity, ctime/mtime/size, complete Markdown, MetadataCache, outgoing targets and resolver snapshot; incoming dependencies are compared too. The plan is rebuilt from the current validated analysis and a copied confirmation snapshot. Analysis replacement or in-place response mutation during verification fails publication.

Selection or confirmation changes remove the entire published plan. Selection changes during pending verification, cancellation, close and invalidation suppress late results. Existing vault/cache listeners invalidate the Analyzer and dispose the planner on source/dependency changes. No writer, journal or completion port is available to the bundle builder/session path. Both notes must be rereviewed after any stale state.

Manual context-role/dependency checkboxes are assertions, not semantic evidence. MetadataCache can be incomplete; undetected consumers and external source reliability remain unknown. This feature cannot claim semantic equivalence, archive eligibility or completeness merely because every local block was copied.

## Frozen regression and applicability

The PR92 corpus and reference annotations are unchanged: SHA-256 `dc7cfdf692791552abd9b06c128f6a2c78f666882b159412b647ef747ef0cda8`. Native regression uses actual MetadataCache, file identities and resolver, with scripted Analyzer control responses. Diagnostic old MergePlan metrics call the unchanged pure validator; GroupPlan 06 uses the existing session; bundle cases use the actual UI/session.

| Scenarios | Result | Reason / retained limitation |
|---|---|---|
| 03, 04, 21, 24 | Existing MergePlan ready, 4 | Ordinary paragraphs remain available; YAML/Unicode cases keep their existing path |
| 06 | Existing read-only GroupPlan ready, 1 | Original heading branch/context still works |
| 07 | New read-only Code + Explanation | Shared scheduler scope, toy purpose, entire JS fence and zero-slot counterexample stay together |
| 08 | New read-only List + Context | Catalogue scope, ordered steps and prohibition on inventing a date stay together |
| 09 | New read-only Quotation + Attribution | Archive scope, donor attribution, complete quote and photograph/status paragraph stay together |
| 05, 19 | No new permission | Heading contexts and unresolved external exercise cards still require evidence; bundle planner refuses headings |
| 22 | Refused | Rich structural dependencies; native terminal zero-length sections fail strict coverage too |
| 23 | Refused | Conditional/pronominal prose has no supported structured core; adjacency is insufficient |
| 01, 02 | No requested transfer | Same-information/no-op scenarios; no bundle offered |
| 10 | No bundle | Links/embeds require a separate preservation policy |
| 11, 13, 14 | No permission | Conflict/version evidence is not resolved structurally |
| 12, 15, 20 | No new requested transfer | Different conditions, project identities or hypothesis/status must remain distinguished |
| 16, 17 | Refused | Unrelated or insufficient context |
| 18 | Analyzer input refusal | Full-source size limit unchanged |

Among the same **12 reference-useful scenarios**, at least one locally reviewed plan is now preparable for **8/12**, versus **4/12** at PR92 and **5/12** at PR93. Of these eight, **only four have the existing executable MergePlan path**. One GroupPlan and three ContextBundlePlans are previews only. No new archive/Undo capability follows from the increase.

For 09, the cited photograph is **not fetched or authenticated**. The plan preserves the note's statement about it and the uncertainty sentence as attributed text, without resolving the historical colour claim. If the user needs the photograph to interpret the transfer and cannot verify that dependency, they must choose unresolved and no plan can publish. Similarly, a review decision supplied by the synthetic harness is not independent human evidence.

The corpus was AI-authored/curated; these counts measure local planner applicability under explicit scripted review decisions, **not model quality, precision or semantic safety**. No labels were changed to increase the count and no live paid model was called.

## UX and next work

The workflow intentionally requires many decisions: A/B, kind, candidate, each context paragraph, three separate confirmations, dependency decision and EOF choice; distinct knowledge adds another intent check. Repeated scope is visible in the resulting canonical, and long full-text panels require scrolling at 390px. The safe one-core restriction remains impractical for ordinary long documents with headings or several examples.

Next evidence should address composing verified heading scope with these bundles, explicit attribution/source dependencies and multiple-core boundaries. Then define a dedicated journal validator before any write path. Atomization is still premature: neither structural completeness nor manual assertions establish semantic independence. Existing strict planners should remain unchanged while those policies are tested.

See [native report and screenshots](context-bundles-native.md) and [machine evidence](context-bundles-evidence/native-report.json).
