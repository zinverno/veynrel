# Remaining actionable Community review advisories

Baseline: `3f2eab66e73ee4aaaf898a369bebc9242b61c10c` (merged PR #23), plugin 1.7.0, `minAppVersion: 1.8.7`. Main CI passed, including npm 10.9.2 and 11.11.0 scanner installs. A clean baseline checkout reproduced 0 errors / 4 warnings: fetch, two configuration-path warnings, and missing declarative settings. The maintainer reports the same remaining hosted Preview findings; this task does not claim a new hosted scan.

`api.ts`, the manifest and dependency lock are unchanged. The streaming implementation, request behavior, cancellation, SSE parsing and retained fetch advisory are outside this change.

## Authoritative configuration-directory boundary

Previously, `validProposalPath` rejected a hardcoded configuration-folder name, including unrelated nested folders, while the application also had a separate actual-directory guard. Both `validProposalPath(value, configDir)` and `validProposalDetail(value, configDir)` now require the authoritative directory explicitly. There is no fallback value. Missing/empty configuration context fails closed.

The runtime chain is `ObsidianProposalVault.configDir` → actual `Vault.configDir` → preview, reviewed proposal, claimed proposal, and the immediate write guard. A hostile Companion cannot bypass these checks by calling the application directly or replaying a proposal. Validation is repeated after the claim and inside the write guard, including if configuration changes during the operation.

Matching is case-insensitive and segment-bounded. Root and descendants are rejected. With `.config` configured, `.configuration/test.md` and `notes/.config/test.md` are ordinary unrelated paths; `.obsidian/test.md` is likewise permitted. Traversal, absolute paths, backslashes, drive/scheme separators, empty segments, controls and unsafe whitespace remain rejected. Protocol v1 and content/hash/claim constraints are unchanged.

Tests cover default/custom/nested configuration directories; root and child; case and trailing separator normalization; prefix lookalikes; Unicode; traversal/absolute paths; normal notes; preview before reads; CREATE/UPDATE/DELETE before claims; replay; configuration changes during claims and immediately before writes. Existing hostile-path tests and all five proposal mutation probes remain intact.

## Dual settings implementation

This follows the official [Path B migration](https://docs.obsidian.md/plugins/guides/migrate-declarative-settings): older hosts call `display()`, modern hosts consume `getSettingDefinitions()`. Both use **one inventory and the same callbacks**. Modern refresh calls `update()` only after checking the API version and method capability. The manifest and supported minimum are unchanged.

Inventory: **27 original `Setting` rows**, plus existing provider cards, information blocks, model presets/list actions, connection tests, status blocks and hero. These are represented by **34 definitions in six named sections plus the hero group**, covering **26 durable settings**. There are **31 custom render definitions**, **two native controls** (filename template and copy notification), and **one explanatory row**. Custom rows are real rendered controls/actions, not invisible search placeholders. The hero alone is intentionally not searchable.

The existing pinned Obsidian declaration package remains unchanged. The plugin owns the small shared row metadata type needed by its legacy renderer. A separate compatibility check replaces the declaration package in a disposable checkout with the actual official npm packages 1.13.0 and 1.13.1: the entire plugin typechecks against both. No ambient shim, cast around the new API, vendored declaration, lint suppression or dependency upgrade is added.

The following is the complete durable setting inventory. Every edit uses the existing `plugin.saveSettings()` path. “Notify semantic” means the original controller invalidation callback, not a new background operation. Descriptions, visible names and option labels remain the existing translated strings. Machine comparison against the pre-change native DOM checks names, descriptions, types, placeholders, option lists, ranges and action buttons.

| Section / existing name | Stored key | Control; default | Visibility, validation and effects |
| --- | --- | --- | --- |
| Language model / provider cards | `provider` | Five cards; OpenRouter | All visible; resets endpoint/model to that provider's existing defaults; saves and refreshes dependent rows. |
| API key | `apiKey` | Password + eye; empty | Hidden for Ollama; trims; provider-specific hint/placeholder; eye affects display only. |
| Model | `model` | Text + presets; `google/gemma-2-9b-it:free` | Trims; provider-specific description, placeholder and presets; chip updates stored value and input. |
| Base URL | `baseUrl` | Text; `https://openrouter.ai/api/v1` | Trims; provider-specific description/placeholder; request validation unchanged. |
| Temperature | `temperature` | Slider 0–1, step 0.05; 0.65 | Saves selected value; original tooltip behavior. |
| Embeddings / Enable semantic features | `semantic.enabled` | Toggle; false | Notify semantic, save; indexing remains explicit. |
| Embedding provider | `semantic.embeddingProvider` | OpenRouter/OpenAI-compatible/Ollama dropdown; OpenRouter | Resets embedding endpoint/model to profile defaults; notify semantic, save, refresh. |
| Embedding model | `semantic.embeddingModel` | Text; `openai/text-embedding-3-small` | Trims; provider-specific placeholder/description; notify semantic. |
| Embeddings base URL | `semantic.embeddingBaseUrl` | Text; `https://openrouter.ai/api/v1` | Trims; existing HTTP(S), query/fragment validation remains in provider code; notify semantic. |
| Embeddings API key | `semantic.openRouterApiKey`, `semantic.openAICompatibleApiKey` | Password + eye; both empty | One row switches between independent keys; hidden for Ollama; trims, notify semantic; eye affects display only. |
| Companion / enable | `companion.enabled` | Toggle; false | Notify Companion, save, refresh; sync stays explicit. |
| Companion endpoint | `companion.endpoint` | Text; `http://127.0.0.1:27124` | Trims; notify Companion; existing endpoint validation and remote HTTPS restriction retained. |
| Companion token | `companion.token` | Password; empty | Trims; separate Bearer credential; notify Companion. |
| Deep audit / Files per request | `deepAudit.batchSize` | Slider 2–15, step 1; 5 | Existing recommended range description and save behavior. |
| Parallel requests | `deepAudit.maxConcurrent` | Slider 1–6, step 1; 3 | Existing free/paid-tier guidance and save behavior. |
| Delay between requests (ms) | `deepAudit.delayMs` | Slider 0–5000, step 250; 1000 | Existing rate-limit guidance and save behavior. |
| Response insertion / default location | `defaultInsertion` | Seven-option dropdown; end | All original insertion choices preserved. |
| Folder for new notes | `newNoteFolder` | Text; empty | Trims; empty means vault root. |
| Folder for MOC notes | `mocFolder` | Text; `MOCs/` | Trims; original placeholder/description. |
| Where to put atomic notes | `atomsLocation` | Same folder/shared folder dropdown; same | Saves; atomic folder row remains visible, as before. |
| Folder for atomic notes | `atomsFolder` | Text; `Atoms/` | Trims; used only in shared-folder mode. |
| Filename template | `filenameTemplate` | Native declarative text; `AI-{{date}}-{{topic}}` | Preserves whitespace and variables; same save hook; legacy uses ordinary TextComponent. |
| Interface / language | `language` | Auto/English/Russian dropdown; auto | Calls existing `setLanguage`, saves and refreshes; command labels still require reload. |
| Context menu | `showContextMenu` | Toggle; true | Saves; existing reload notice retained. |
| Copy notification | `notifyOnCopy` | Native declarative toggle; true | Same save hook; legacy uses ordinary ToggleComponent. |

`topK`, `semanticAutoSyncSuspended`, `companion.timeoutMs` and `companion.vaultId` were not settings-tab controls and remain internal/persisted as before. No fields are reset on migration.

### Existing custom/action rows

- Provider cards, provider help links/disclosures, model presets and list actions share their original render callbacks. Ollama lists local models; OpenRouter's public free-model list remains available. No paid provider credentials are used by verification.
- Provider connection test keeps its existing progress/success/error behavior and request implementation.
- Embedding connection test keeps the in-flight lock, provider/model snapshot, disabled button and detached-element guards. Independent embedding credentials remain separate from language-model credentials.
- Semantic status and index/update, clear, rebuild and refresh buttons retain their controller methods, busy/disabled conditions, confirmations and explicit mutation boundaries.
- Companion connection/test/sync buttons retain their controller methods, status/errors and enable condition. Remote transmission disclosure remains conditional on the endpoint.
- Dynamic provider/embedding/Companion-enable/language changes rebuild the shared inventory; no second settings implementation is maintained.

Custom definition names participate in Obsidian's rendering identity. Native testing caught the initial duplicate “Model” identity; the presets search row is now named “Model — <provider>”, while its original visible controls remain unchanged. A regression assertion rejects duplicate render identities for all five providers.

### Parity protection

`settings.test.ts` checks all 26 bindings, 34 definitions, actual controls for durable rows, provider/embedding visibility, unique rendering identities and persistence through the shared save hook. An AST check rejects a durable binding missing from the inventory and prevents adding an independent imperative row to `display()`. Legacy rendering itself iterates `getSettingDefinitions()`, so a newly declared row reaches both paths automatically. Custom action/status rows intentionally have no durable key.

## Verification evidence

See [native results](review-advisory-evidence/native-settings.json) for versions, native checks, baseline parity comparisons, search navigation and lifecycle results. All native runs use disposable vaults/config/cache/runtime directories under `/tmp/vault-audit-advisories/`, a loopback deterministic provider/Companion mock, and placeholder credentials. Companion is mocked for settings action testing; its separate server repository is untouched.

The native test synchronizes on saved settings and completed controller promises, then inspects actual controls and files. Confirmation dialogs are accepted only for the disposable fixture vault. In Obsidian 1.13 the settings UI may move to its own native window; automation follows the settings container's owning document.

Final native gate: **1.12.7: 24 settings/action checks + 27 lifecycle checks; 1.13.7: 33 + 27**, including all nine search terms on the modern host. Both also passed a full vault reload with persisted values. All 129 baseline row comparisons per host preserve functional controls. Ten modern DOM differences are only Obsidian's `select.dropdown.is-measuring[aria-hidden=true]` copies reflecting intentionally changed selections; primary option lists are identical. Final plugin exceptions/errors: zero. The only final console warning is Electron's host CSP warning on reload; security headers/settings were not changed. Earlier automation selector/confirmation-window errors and the corrected duplicate Model identity are not counted as passing runs.

### Final clean-clone commands

Node 24.14.1, npm 11.11.0, Manjaro Linux. Each scanner install recreates `node_modules`; normal installation and the full suite follow. Production inputs are identical to the native-tested build.

| Command | Result |
| --- | --- |
| `npx --yes --package npm@10.9.2 npm ci --ignore-scripts` | PASS |
| `npx --yes --package npm@11.11.0 npm ci --ignore-scripts` | PASS |
| `npm ci` | PASS |
| `npm test` | PASS: 845 tests, 31 files |
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS: 0 errors, 1 retained warning; includes typecheck/build and bundled-source lint coverage |
| `npm run audit:proposals` | PASS: all 5 security mutations killed |
| `git diff --check` | PASS |
| Bundle boundary | 60 inputs; zero standalone Companion inputs; zero tracked `companion/` files |

Installed `main.js` in both native vaults and the fresh clean-clone production build share SHA256 `4b2b59578f1bc00d09b8cdc4c16ac7f734e31f3bc49fbafb9fab625a594d3989`.

Unchanged SHA256 values: `api.ts` = `e9f71e816ef3489420d17801957994e963b203062c6c308a29767af8f66de4df`; `manifest.json` = `e780bcfc96864dc6dafef007a9df1f5d3545eadb133376fd5f5fd142cec8ec51`; `package-lock.json` = `4ae8e0fed580bd702fdd8cdf3fb391ba108916151392584649ef706d27493d3c`.

The remaining official warning is intentionally retained, unsuppressed:

```text
api.ts:413:22
Unexpected use of 'fetch'. Use the built-in `requestUrl` function instead of `fetch` for network requests in Obsidian
no-restricted-globals
```

A new authenticated Community Preview is still required to confirm hosted output. No merge, release, tag, published asset or version change is included.
