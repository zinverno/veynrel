# Community scanner review, November 2026

Compared main at `c1528c7f6f4681316f4bf953bf6f532dc3066fd0` with implementation `660f0b7f38d4b69627c61ed82b2efc3ac9a92ed9`. The installed production bundle has SHA-256 `30f57547fd4702849f9a4db830dd2910c82f698642a7327f2b7246ce8be77b55`.

| Reported location on main | Disposition | Verification |
| --- | --- | --- |
| `styles.css:3368` | Fixed | Workbench sets the pane's local empty-state class when it renders the placeholder. Native Obsidian measures a 120 px minimum before loading and a 0 px minimum with the graph mounted. |
| `consolidation/registryPlan.ts:10` | Fixed | The existing string test now narrows the array through a type predicate. Comparison still sorts a copy. Registry tests cover reordered arrays and object keys. |
| `health/ui/renderTools.ts:62` | Fixed | The click handler checks for the event's pointer type. Mouse clicks and keyboard activation open the explanation. Touch selects the segment first. |
| `recall/authoring.ts:26` | Fixed | TypeScript 5.3 declares the match index optional. The parser checks it and uses the original UTF-16 offset. 54 before/after cases cover CRLF, CR, LF, BOM, Unicode and section boundaries. |
| `api.ts:460` | Retained for streamed generation | Native loopback SSE delivered a split UTF-8 character and two ordered tokens. An explicit abort and the production 120 s timeout closed the connection. HTTP 503 kept its status and delivered zero tokens. |
| `studio/community/transport.ts:13` | Retained for catalog safety | Chromium consumed synthetic responses for the allowlisted URL. A 302 produced zero requests to its target. The transport rejected incorrect MIME, an excessive declared length and an oversized UTF-8 body without a declared length. |

## Transport review

Obsidian's `requestUrl` returns a completed response with text, JSON and ArrayBuffer accessors. Its public parameters provide HTTP error handling through `throw`. They expose no streamed reader, external abort signal, redirect policy, credential mode or incoming byte limit. [Obsidian API declarations](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts)

The AI editor consumes events as they arrive. Its decoder carries incomplete UTF-8 and SSE lines across chunks. A caller's abort or the deadline aborts the request and interrupts a pending read. Racing a buffered promise with a timer would leave the underlying download running. Buffered AI calls already use the Obsidian transport.

Community permits only exact catalog URLs. Fetch rejects a redirect before contacting its target, omits credentials and referrer, checks status, final URL and MIME, then counts incoming bytes before decoding each chunk. A final URL or size check on an already buffered response happens after the second request or allocation. Both advisories remain visible in lint. [Fetch standard](https://fetch.spec.whatwg.org/)

## Scanner and native results

The isolated comparison used the repository's [scanner tool lock](obsidian-review-safe-v1-evidence/scanner-tools-lock.json), the project ESLint configuration on the five reported TypeScript files, and the official Stylelint configuration on the full stylesheet. ESLint produced three diagnostics on main and two on the candidate. Its baseline reproduced the Recall assertion and both network warnings. The registry and ring assertions were present in the source but did not trigger this local toolchain. Stylelint's targeted pseudo-class warnings fell from one to zero. Its other error diagnostics went from 1,678 to 1,677, predominantly formatting and selector ordering. The hosted branch Preview requires an authenticated entry manager and was unavailable. [Obsidian branch review](https://docs.obsidian.md/community-directory/manage-entry)

Full Vitest passed 5,474 tests across 217 files with two workers. Typecheck, production build and repository lint passed. Lint reported the two reviewed fetch warnings. The mutation audit killed all five mutants and each restored baseline passed. An earlier four-worker run under concurrent load reported a chunker timing failure and ended with signal 15.

Native Obsidian 1.13.7 on Linux passed 138 semantic, map, Style and Recall checks and 92 UI checks including ring mouse, keyboard and Chromium touch input. The runs used disposable vaults, RU/EN, both built-in themes and wide/narrow layouts. The separate network probe used a loopback SSE server and intercepted catalog responses before outbound transmission.

## Streamed insertion when the destination changes

The native reproduction sent a first token to A, opened B in the same leaf, then released a second token. On main and on the initial scanner-only build, Obsidian reused the editor, B acquired the late token on disk, and the stream resolved successfully.

Both current-note and new-note insertion now pin the destination file and editor. A workspace change aborts the fetch. Each token checks the destination again before writing, including when the editor changes before a workspace notification. The operation releases its event subscriptions when it finishes or the plugin unloads.

The native regression uses the actual command, prompt and insertion menu for both destinations. Normal completion saves both tokens in order. Switching notes closes the server connection before the late token, preserves the partial output in its destination, and leaves B byte-identical. Two unit cases also exercise returning to A after cancellation and a chunk arriving before the workspace event.
