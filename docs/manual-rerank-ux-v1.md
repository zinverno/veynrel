# Manual Rerank UX v1 — verification

Manual search now displays ordinary semantic results without calling Rerank. **Refine results** sends the saved pool only after an explicit click and does not request another embedding. Automatic mode remains available and is retained when migrating previously enabled installations.

Base: `2ba384eb76346948f41172324e92e633ff0c4ca9` (main, merge #74), verified against origin before implementation. Branch: `feat/discover-manual-rerank-ux`. No release, version change, dependency, model substitution or index migration. Historical #71/#73/#74 evidence is unchanged.

## Implementation and acceptance

- `searchDiscover` retrieves up to 30 candidates once when Rerank is enabled; the modal shows 10. Off mode retains the existing limit of 10 and performs no additional source reconstruction.
- `refineCandidates` accepts already retrieved candidates. Manual and automatic use the same fragment preparation, payload limits, production serializer/validator, score mapping, ordering and fallback. The evaluation driver's existing `refinedSearch` wrapper remains compatible.
- The controller holds the pool in memory and gives the UI a session ID, configuration readiness and a refinement action. It does not expose a key or a full pool to the modal. The UI retains only original/refined display results for local toggling.
- A session captures the trimmed query, Rerank settings/revision, semantic configuration, runtime identity, index generation and source revision. Input edits, another search, close, settings changes, source changes, index changes and unload invalidate it. Late replies cannot replace a newer display. No index barrier is held during HTTP.
- Double clicks share at most one in-flight operation. Successful refinement is cached for that session; toggles never call the API. A failed attempt offers an explicitly disclosed, potentially billable retry. There are no automatic HTTP retries or alternate models.
- Actual current chunks must match indexed ID/content hash. Previews and old offsets are not outbound text. The #72 filename-provenance rule remains in force. Missing/unsafe fragments stay unscored; fewer than two usable candidates makes no HTTP call. Semantic scores, local names, previews and fragment navigation are preserved.

Settings migration is tested through the production merger and plugin loader: new/off installations use manual; previously enabled installations without a mode use automatic; explicit modes, model IDs and keys are preserved. The real settings dropdown/save queue test verifies rollback in place and cancellation notification without semantic-index invalidation.

## Automated checks

| Check | Result |
| --- | --- |
| `npm test` | PASS — 2,896 tests / 115 files; fake/mock transports only |
| `npm run typecheck` | PASS — plugin and Health projects |
| `npm run lint` | PASS — no errors; existing allowlisted `api.ts:402` streaming-fetch warning |
| `npm run audit:proposals` | PASS — 5/5 mutations killed; restored tests passed |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| Native-driver syntax checks | PASS — both scripts |

Focused tests exercise the real semantic runtime/index with synthetic embeddings: the saved 30-document pool, 10-result display, unchanged scores, zero extra embedding calls, missing credentials, fallback/explicit retry, and cancellation before dispatch and while awaiting the provider. UI tests cover local toggles, double clicks, input changes, close/new-search races, stale-session publication and navigation. Existing provider contract, Unicode/payload bounds, stale/excluded/deleted fragment and provenance suites remain enabled.

## Native Obsidian — PASS with fake providers

Final run: **2026-10-10 17:28 UTC**, Linux, Obsidian **1.13.7**, Electron **43.6.0**, default theme. Separate temporary profile and 34-note synthetic vault; no personal vault or permanent profile. [Structured evidence](manual-rerank-ux-v1.json) records **40 passing assertions**.

Installed `main.js` SHA-256, equal to the workspace build:

```text
a802efc09fa617577b63efb855ecbf4f448f88d3d835b54bf350e9a14cbf4b45
```

The final complete run made **10 fake Rerank transport calls** and **15 localhost synthetic embedding calls**, including search/indexing scenarios. **Paid calls: 0.** The local OpenRouter test key was not read. These counts describe the final complete run; development runs that stopped on harness assertions are not live-model evidence.

Observed through the installed plugin:

1. Opening Discover/settings and the manual search window sends no Rerank request. Two manual searches perform exactly two query embeddings, no Rerank and no source reconstruction; each displays 10 results.
2. Keyboard activation sends one bounded 30-document request through the real production adapter/validator with fake transport; double click does not send again. No filename-derived fallback headings appear. No additional embedding occurs.
3. Original results remain visible while waiting. The returned index mapping reorders them, the semantic score stays unchanged, and focus returns to the selected order switch. Original/refined toggles are local. Keyboard activation opens the chosen note at the selected fragment.
4. A fake 429 retains original results and shows the paid-retry disclosure. Only another click sends a second request. Query edit, new search, close, mode change and source edit block late replies.
5. Changing credentials invalidates the saved pool; reopening without a key shows the settings path. The native dropdown switches to automatic, which performs one query embedding plus one fake refinement. Reopening settings preserves the mode and index identity is unchanged.
6. RU and EN labels, keyboard controls and widths **320, 390, 768, 1024 and 1440 px** pass. The button and payment disclosure are fully inside the modal at every width. Visual inspection found and corrected a clipped footer by making only the search dialog's result list shrink within its available height; RAG and other discovery dialogs keep their layout.

The harness uses ordinary CDP keyboard events, the actual settings language selector, and waits for the existing debounced indexing after its synthetic source-edit case. That index change correctly invalidated an earlier test session; no product race guard was relaxed to make the test pass.

Reproduction commands and a six-step manual acceptance checklist are in [Rerank documentation](rerank-v1.md#verification-and-manual-acceptance). The new scenario reuses the existing credential-free native harness; it is not added to CI and cannot read a real key.

## Limits and product conclusion

This is UI/control-flow evidence, **not a new live-model quality test**. Real results remain in [#73 comparison](rerank-live-model-comparison.md) and [#74 hard benchmark](rerank-hard-benchmark-v1.md). In the latter, embeddings already supplied a relevant top-1 for 23/24 positive queries, while rerank improved nDCG in 11, left 11 unchanged and regressed on 2. Manual refinement lets users decide whether its additional transfer, delay and potential cost are useful; no difficulty heuristic or default model change is introduced.

Not evaluated: mobile hardware, other operating systems, screen readers, custom themes and search in an Obsidian popout. A native `requestUrl` already sent to a real provider cannot be recalled; cancellation stops waiting and ignores its reply, but cannot guarantee cancellation of billing. Any vault event conservatively expires the session, including an unrelated note change. A new explicit search is then required.
