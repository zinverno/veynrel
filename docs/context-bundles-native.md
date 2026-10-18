# Native Contextual Block Bundles acceptance

Native acceptance runs only in a fresh synthetic vault with real Obsidian, `Vault.read`, TFile identities, MetadataCache and resolver. The planner has no Apply route; writer instrumentation must remain zero throughout.

The [machine report](context-bundles-evidence/native-report.json) contains exact plans, all 24 frozen scenario outcomes, UI assertions and refusal details. The [contract/report](context-bundles-v1.md) separates local structural validity from user context assertions and model quality.

## Reproduce

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-bundles-NEW --context-bundles
```

The root must not exist. The script starts its own isolated `/usr/bin/electron43 /usr/lib/obsidian/app.asar` profile and terminates that instance. It never opens a personal vault. Fixture seeding and simulated user edits/restorations use the test filesystem directly; product writer counters remain zero. The corpus bytes/labels are checked against the PR92 freeze before starting.

Analyzer transport is explicitly replaced with scripted control responses. Every planning operation checks that no additional completion occurs. No live model or real API key is used. Fetch/XHR and existing Decisions/Rerank paths are guarded; operation-journal adapter mutations and journal disk hashes are checked. This is not an OS-wide network-isolation claim.

## Coverage

- Actual UI/session builds for frozen 07/08/09; complete before/after/source strings and diff verified against plans.
- Existing four MergePlan results against native notes and unchanged pure validators; GroupPlan 06 through its existing twice-read session.
- 05/19 unresolved heading/external context, 22 rich markup/metadata, 23 unsupported prose adjacency remain refused.
- Synthetic CRLF/Cyrillic/astral/combining-mark bundle, both canonical directions.
- Native negative fixtures: nested quotation list, quote indented code, thematic-break whitespace variants, nested ordered item, list continuation, orphan footnote and unclosed fence.
- Separate context selections and boundary/context/dependency/insertion confirmations; unreviewed external dependencies disable Build.
- Related-distinct extra intent retains manual-review provenance; a semantic conflict cannot be confirmed away.
- Reselection clears the whole plan; cancel/close during final reread suppress late results; editing either source invalidates the Analyzer and disposes the planner.
- Real keyboard Enter activates Build. RU/EN × light/dark × 1200/390px for all three kinds: no horizontal overflow or missing localization tokens.
- All synthetic source Markdown files byte-identical at completion; zero Markdown writer, operation-journal and observed network calls.

## Screenshots

All captures are original native screenshots of synthetic data. The 24 matrix captures have full before/after panels open; long contents scroll rather than truncate. Exact complete strings are in the machine report. Twelve further captures show context decisions and diff for each kind/language; five show refusals.

| Kind / language | Light 1200 | Light 390 | Dark 1200 | Dark 390 | Context | Diff |
|---|---|---|---|---|---|---|
| Code EN | [image](context-bundles-evidence/bundle-en-07-theme-light-1200.png) | [image](context-bundles-evidence/bundle-en-07-theme-light-390.png) | [image](context-bundles-evidence/bundle-en-07-theme-dark-1200.png) | [image](context-bundles-evidence/bundle-en-07-theme-dark-390.png) | [image](context-bundles-evidence/bundle-en-07-context.png) | [image](context-bundles-evidence/bundle-en-07-diff.png) |
| Code RU | [image](context-bundles-evidence/bundle-ru-07-theme-light-1200.png) | [image](context-bundles-evidence/bundle-ru-07-theme-light-390.png) | [image](context-bundles-evidence/bundle-ru-07-theme-dark-1200.png) | [image](context-bundles-evidence/bundle-ru-07-theme-dark-390.png) | [image](context-bundles-evidence/bundle-ru-07-context.png) | [image](context-bundles-evidence/bundle-ru-07-diff.png) |
| List EN | [image](context-bundles-evidence/bundle-en-08-theme-light-1200.png) | [image](context-bundles-evidence/bundle-en-08-theme-light-390.png) | [image](context-bundles-evidence/bundle-en-08-theme-dark-1200.png) | [image](context-bundles-evidence/bundle-en-08-theme-dark-390.png) | [image](context-bundles-evidence/bundle-en-08-context.png) | [image](context-bundles-evidence/bundle-en-08-diff.png) |
| List RU | [image](context-bundles-evidence/bundle-ru-08-theme-light-1200.png) | [image](context-bundles-evidence/bundle-ru-08-theme-light-390.png) | [image](context-bundles-evidence/bundle-ru-08-theme-dark-1200.png) | [image](context-bundles-evidence/bundle-ru-08-theme-dark-390.png) | [image](context-bundles-evidence/bundle-ru-08-context.png) | [image](context-bundles-evidence/bundle-ru-08-diff.png) |
| Quote EN | [image](context-bundles-evidence/bundle-en-09-theme-light-1200.png) | [image](context-bundles-evidence/bundle-en-09-theme-light-390.png) | [image](context-bundles-evidence/bundle-en-09-theme-dark-1200.png) | [image](context-bundles-evidence/bundle-en-09-theme-dark-390.png) | [image](context-bundles-evidence/bundle-en-09-context.png) | [image](context-bundles-evidence/bundle-en-09-diff.png) |
| Quote RU | [image](context-bundles-evidence/bundle-ru-09-theme-light-1200.png) | [image](context-bundles-evidence/bundle-ru-09-theme-light-390.png) | [image](context-bundles-evidence/bundle-ru-09-theme-dark-1200.png) | [image](context-bundles-evidence/bundle-ru-09-theme-dark-390.png) | [image](context-bundles-evidence/bundle-ru-09-context.png) | [image](context-bundles-evidence/bundle-ru-09-diff.png) |

Refusals: [05](context-bundles-evidence/bundle-refusal-05.png), [19](context-bundles-evidence/bundle-refusal-19.png), [22](context-bundles-evidence/bundle-refusal-22.png), [23](context-bundles-evidence/bundle-refusal-23.png), [semantic conflict](context-bundles-evidence/bundle-semantic-refusal.png).

## Review and limits

Independent adversarial review found nested block syntax accepted inside otherwise simple quotation/list payloads and invalid native list-item entries hidden by overlap filtering. Both were rejected explicitly, including whitespace thematic-break variants; negative unit and native cases cover the fixes. Earlier native development runs passed their then-current assertions; they are superseded by the final exact-artifact capture listed below.

A photograph mentioned in frozen 09 is not authenticated: the entire attribution/status statement is preserved, not established as true. Scripted user decisions and AI-curated references cannot prove semantic completeness or LLM quality. No paid calls, physical mobile, screen reader, human usability study, crash test, write/Undo/recovery or filesystem guarantee is claimed. 390px is Linux desktop viewport emulation.

## Final run

**PASS**, `/tmp/pair-inspector-context-bundles-final/vault`, Obsidian **1.13.7**, Electron **43.6.0**. **136 assertions** (18 existing inspector + 118 bundle/regression), **68 synthetic files** unchanged, **41 screenshots**. Production `main.js` SHA-256: `c398ba5ea0eeab00797c536bfe8fac74bc02188c51ab30e60006c87bf42276dc`. **0 writers, 0 journal mutations, 0 observed network calls**, 46 explicitly scripted Analyzer completions, **0 additional planning completions**, **0 paid model calls**.

The 68 files consist of the unchanged 48-note corpus, four CRLF/direction fixtures and sixteen negative-fixture notes. All artifacts are synthetic. See [validation manifest](context-bundles-evidence/validation.json) for local gates and [artifact hashes](context-bundles-evidence/sha256.json).

Local gates: **3776 tests / 145 files** (67 new tests), typecheck, lint, build, proposal mutation audit **5/5**, and diff-check passed. Lint reports only the pre-existing `api.ts:404` fetch advisory. The first audit invocation received empty child stdout; an unchanged rerun passed every mutation and restored baseline. No check was weakened. GitHub CI must also pass on the PR head; its status is reported in PR checks.
