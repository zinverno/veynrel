# Relationship Analyzer: session-bound evidence references

New analyses select prepared fragment IDs instead of reproducing Markdown quotes. The local adapter resolves those references from the same frozen input snapshots, then passes the resulting quote-format response through the original strict validator. A rejected response never becomes analysis or planner authority.

## Incident and offline limits

The private supplied response was replayed, unchanged, through the validator at `f246cecf22afdad883023f8dcffb7541ae46dfc6`, without any provider request. The bundle did not contain the historical request snapshots. Only the two expressly authorized current TEST files were read; their hashes were retained locally outside Git. Their identity with the historical inputs is **not proven**.

Against those current files, five supplied quotes have exactly one occurrence. One has zero exact occurrences and differs only in its first Cyrillic letter's case. The original validator returns `unverifiedEvidence`. Independently, an atomization alternative cites a `unique_a` claim without citing `standalone_a` or `standalone_b`. It remains inconsistent even when all quotes are exact. Synthetic regressions reproduce both defects independently; private JSON, notes, hashes, paths and screenshots are excluded from this repository.

The diagnostic audit enumerates quote-location, evidence-ID and action-kind problems without creating a validated result. Literal matching cannot establish whether a quote supports every substantive thought in a claim; that semantic limit remains.

## Contract and bounds

- Explicit wire schema: `veynrel.relationship.refs.v1`, with `evidenceA`/`evidenceB` IDs or null. There is no legacy wire autodetection, fallback, JSON repair, quote repair or retry. Legacy **internal** `RelationshipResult` and downstream revalidation keep `quoteA`/`quoteB` unchanged.
- IDs contain a fresh catalogue nonce, side and ordinal. The catalogue retains frozen copies of both saved snapshots, including file identity, path, stat and complete content. Current snapshots must still match. New preparations cannot reuse earlier IDs even when text is unchanged. Settings/source/navigation/cancel/close invalidation drops the catalogue together with consent and analysis.
- Candidate slices are physical Markdown lines, split at 600 native JS UTF-16 units when necessary. Formatted text is allowed as evidence; this is not a planner's editable-range parser. Boundaries preserve surrogate pairs and CRLF. Every offered slice is nonempty, at most 1200 units, and occurs exactly once in its own complete source.
- A repeated seed is considered once and deterministically widened before generation, within the 1200-unit limit. Unresolvable seeds are omitted. At most 256 distinct candidates and 128 offered fragments per side are considered. Skipped occurrences, later lines and uncovered non-whitespace UTF-16 units are disclosed; they are not evidence of absent content. This bounded catalogue does not promise every useful claim is expressible.
- Complete A/B Markdown remains in the request, including frontmatter, formatting, context and flashcards. Existing 20,000/32,000 character limits and 128 KiB serialized-body limit remain. Catalogue overhead counts **before** consent; oversized preparation fails without truncation or dispatch. Consent shows fragment count, uncovered characters and the full actual payload.
- The model is asked for one supported thought per claim, one principal recommendation and `alternatives: []` by default. Supplied alternatives are still independently validated. `unique_a` is never renamed to `standalone_a`; literal provenance does not establish standalone value, semantic truth or uniqueness.
- The strict validator's acceptance conditions are unchanged. A wrapper attaches bounded structured diagnostics on rejection. UI shows a short explanation and expandable field/claim/side/code details, rendered as text. No automatic diagnostic export, raw-response logging or source persistence was added.

## Preserved owners

#110's 8192-token ceiling, 120-second timeout, model-specific reasoning policy, explicit finish-reason handling and one dispatch per consent remain. `length` rejects even complete JSON; reasoning is never evidence. #111's recommendation → intent → existing planner, exact review, separate Apply, history and separate Undo remain. List-first does not construct a graph. Ranking, candidate search, map, FSRS, writers, tickets, journals, archive and recovery are unchanged.

The separately authorized historical evaluation CLI still uses `{A,B}` plus quote-format responses and its historical budget. Its prompt is explicitly frozen from #111 in `relationship-legacy-prompts.json`; prompt hash and approval checks remain intact. It was not run against a live provider.

## Verification

Regression coverage includes case/punctuation/Markdown mismatch; zero/ambiguous occurrence; independent invalid alternatives; malformed input diagnostics; unknown/wrong-side/foreign and stale references; UTF-16, Unicode and CRLF/LF; partial catalogue coverage; pre-consent body growth; cancellation and late responses; real transport parser errors; and valid references through intent/planner to exact review.

Native evidence uses a new isolated synthetic Obsidian profile and local HTTP server. No validated result, planner or executor is substituted. Three separate consented responses demonstrate unknown ID, wrong-side ID and invalid atomization. The fourth response recommends combining material; canonical selection, fragment selection, exact review, Apply, history and separate Undo run through existing owners. All Markdown SHA256 hashes return to their originals. The synthetic secondary note remains unchanged. No personal vault installation or paid request is performed.

Final source/build IDs, check results, frames and recording are recorded in [the evidence index](evidence-binding-evidence/README.md). Synthetic loopback responses verify transport and application behavior, **not live-model quality**. An exact historical replay remains unavailable without the historical snapshots.
