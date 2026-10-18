# Structured Context Groups v1

This document records the original read-only PR #93 stage. [Group Safe Apply & Undo](group-apply-v1.md) now adds a separate executor, journal and consent flow; it does not change this planner's boundaries or make a GroupPlan itself write authority.

This is a **read-only** addition to Change Planner, based on merged PR [#92](https://github.com/zinverno/veynrel/pull/92), main `99c28beb4fee14e4ff6ab56e49a08b79fe8dcfcb`. It previews an explicitly selected heading section as a new branch in a canonical note. There is **no Group Apply**: the new `copy_context_group` discriminator is not accepted by any existing executor or journal. Existing paragraph guards, Single/Multi/Merge/Archive Apply, Undo and recovery are unchanged.

## What a group means

`groupStructure.ts` uses saved Markdown and native `MetadataCache.sections` / `headings`. All ranges are half-open UTF-16 offsets. A section starts at its heading and ends immediately before the next heading at the same or higher level, or EOF. Duplicate titles remain distinct by offsets. A chosen subsection includes every descendant heading, paragraph and separator within its section; no model quote selects its boundaries.

v1 accepts unadorned ATX H1/H2/H3 with complete level-by-level ancestry. Setext, H4–H6, missing levels, closing hashes, inline heading markup and unavailable/inconsistent native coverage refuse. It validates section order, bounds and whitespace gaps against the complete Markdown; headings must agree with both native sections and literal syntax. Protected metadata positions must themselves be valid, even outside the selected section.

A subsection cannot silently inherit the canonical note's unrelated title. The **only explicit context representation in v1** is an original heading branch:

1. Copy each ancestor's heading **and its entire direct introduction**, ending before its first child section. These are separate required context ranges, displayed in full.
2. Copy the explicitly selected complete subtree verbatim.
3. Leave all unselected sibling subtrees in the source. The UI shows every noncopied source range. The user must confirm that those siblings are not required by the chosen group.
4. Append this original H1-rooted branch at canonical EOF. Levels are never changed. The canonical's existing text stays intact.

Thus selecting H3 copies its H1/H2 ancestry and introductions, not its siblings or the whole parent chapter. Selecting an entire H1 chapter is also possible, but only as an explicit whole-section selection. No paragraph hint automatically expands into a chapter selection.

The user separately chooses this representation and exact EOF insertion and confirms the group, context and insertion. Exactly two canonical-style newline characters precede the new branch and separate its ranges. Existing line endings within all copied text stay verbatim, including CRLF and mixed-language Unicode. Extra separators are part of the explicit splice and diff; no trimming, releveling, YAML reserialization or paraphrase occurs.

An empty canonical note is unsupported in v1. v1 requires verified native coverage and a final plain paragraph or safe ATX heading. Unsupported trailing structures refuse. Canonical frontmatter and earlier links remain unchanged; source preambles/properties refuse because their scope over the selected group has no preservation policy yet.

## Dependency and semantic boundary

Every transferred range, including required ancestor context, is checked. Links, embeds, tags, block IDs, footnotes, references, URL schemes, code, lists, quotations, tables, HTML, math and ambiguous inline syntax refuse. A complete list is still unsupported; the feature does not infer list closure. Native protected metadata is consulted alongside literal checks. Known `context_a` / `context_b` claims overlapping any copied range remain blocking; heading inclusion alone cannot discharge them.

Plain prose can refer to an external source without a link. The validator is **not a natural-language dependency detector**. The default review state is unknown, and the user must explicitly decide whether needed external sources, attribution or semantic dependencies remain. “A dependency exists or I am unsure” blocks the plan. A mistaken user assertion is not proof of semantic closure; the preview and serialized limitations say so. In acceptance, the separate cards in 05/19 were explicitly marked unresolved rather than treating a successful syntactic check as a transfer recommendation.

`conflicting`, `unrelated`, `insufficient_context`, and conflict/version-difference claims refuse after revalidating the actual Relationship Analyzer response. `related_distinct` requires an additional intentional-copy decision, clearly warning that it is not a merge recommendation and establishes no redundancy. Its original recommendation stays in provenance. No new LLM session or request is introduced.

## Contract and publication

`GroupPlan` is versioned and serializable. It contains both exact paths; serializable ctime/mtime/size/content-fingerprint identities; full saved secondary and canonical before/after; native heading hierarchy; selected and required-context ranges; all unselected ranges; resulting heading offsets; an exact append splice; separately shown separators; confirmations; metadata, outgoing references, incoming summaries and resolver results; complete validated analysis provenance and limitations. A successful plan has an empty `refusals` list; candidate refusals are exposed before building. Runtime `TFile` object identities are compared in the session and deliberately not serialized into pretend durable IDs. The content fingerprint is the existing noncryptographic `stableHash`, not an integrity/security claim.

`ChangePlannerSession.buildGroup()` captures choices, rereads both selected notes and compares them with the prepared sources and valid Analyzer. It checks exact path/TFile identity, full text, ctime/mtime/size, cache, resolved references and pair linktexts. After construction it rereads both again and checks incoming data; `validateGroupPlan()` rebuilds the entire plan and compares the exact serialization before publication. Source/analysis mismatches invalidate the whole session. Cancellation, reselection, vault/cache events, a new analysis, or closing prevent late results from publishing. No other note is read to prove dependency completeness.

No standalone JSON object authorizes a write. A future executor requires a dedicated operation validator and journal protocol. It must not cast this plan into `MergePlan`, `add_link`, or a reciprocal-link operation.

## Frozen PR #92 regression

The corpus bytes and labels are unchanged: SHA-256 `dc7cfdf692791552abd9b06c128f6a2c78f666882b159412b647ef747ef0cda8`. The native harness asserts this against the prior freeze. References were authored by one AI curator and checked by another AI reviewer; independent human expert review and live model evaluation remain **NOT RUN**. This measures planner behavior with scripted Analyzer controls, not LLM quality.

| Cases | Previous plain-paragraph path | New GroupPlan result / reason |
|---|---|---|
| 03, 04, 21, 24 | Ready, unchanged | Remain on the existing plain path; no need to invent headings |
| **06** | Heading refusal | **One new prepared group**: H3 “Смена ответственного”, its H2 “Обсуждение” and H1 “Журнал решений” plus scoped introduction; appended as its own branch to canonical B |
| **05** | Heading refusal | Native section and ancestor ranges can be identified, but the facilitator's separate bell-schedule card is unresolved; no published plan |
| **19** | Heading refusal | Twelve individually bounded station sections; selecting one does not copy eleven others. Exercise cards/observer assignment outside the note are unresolved; no published plan |
| 07, 08 | Neighbor/code/list dependency | No heading group. Additional derived copies with a heading still refuse code/list material |
| 09 | Attribution/context | No heading group; a derived heading wrapper still refuses the quotation |
| 22 | Protected markup | No group; heading-wrapped derivative also refuses. Native zero-length terminal `text`/`element` cache sections fail strict coverage before protected content is considered |
| 23 | Prose context dependency | No heading group; the mechanism cannot promote a pronoun-dependent paragraph |
| 01, 02 | No reference transfer intent | No new operation selected |
| 10, 12, 15, 20 | Manual review / source, condition or concept distinctions | No reference transfer intent; structural candidates alone do not authorize anything |
| 11, 13, 14, 16, 17 | Conflict/version/unrelated/insufficient context | Remain prohibited by semantic guard |
| 18 | Analyzer input limit | Still too large; no completion or plan |

The comparable intended-use denominator stays **12**. Previously **4/12** produced plain MergePlans; they still do. This PR adds **1/12 read-only GroupPlan**, giving **5/12 with some prepared plan**, not five executable MergePlans. Of the three heading-related refusals, one now produces a reviewed plan and two remain dependency-incomplete. These deliberately conservative manual decisions are new acceptance observations, not edits to the frozen reference labels. They must not be scored as model accuracy, general corpus coverage or evidence that all three should be executable.

## UX and next step

The preview shows the complete heading path with offsets, full selected and ancestor text, all unselected text, the exact source/destination paths, resulting branch, full canonical before/after, line diff and serialized plan. Existing text-only rendering avoids expanding links or interpreting hostile Markdown. Native select/checkbox/button controls retain labels and keyboard focus; RU/EN and default light/dark themes are covered.

The explicit ancestor copy can duplicate the introduction and create an additional H1. That is intentional, visible and confirmed; it is a narrow preservation option rather than an automatic reorganization of the canonical note. EOF-only placement avoids attaching unrelated existing sections to a new ancestor. Reviewing long contexts and several confirmations remains costly. A 390px preview wraps heavily; complete sources remain accessible in scrollable, focusable panels.

This evidence supports continuing dependency-preservation work before broadening transfer or starting Atomization. Heading boundaries solve a real subset, but do not resolve attribution, code/list relationships, external cards or prose context. A separate Group Apply protocol would also be needed before any actual copy. This PR implements neither that executor nor broader dependency policies.

## Verification and reproduction

See [native report](structured-context-groups-native.md), [machine report](structured-context-groups-evidence/native-report.json), and [validation receipts](structured-context-groups-evidence/validation.json).

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run audit:proposals
git diff --check
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-structured-groups-UNIQUE --structured-groups
```

The native command requires an installed Obsidian/Electron desktop and a new `/tmp/pair-inspector-*` root. It uses only authored synthetic notes and injected scripted Analyzer completion transport. It blocks renderer fetch/XHR and injects the Analyzer completion transport; it instruments all Markdown writers and every operation-journal family. Fixture seeding and two explicit simulated user edits/restorations are external test filesystem actions, separately distinguished from product writes. No personal vault, provider key or paid request is used.
