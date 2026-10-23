# Processing follow-up to beta UX polish

The Processing page used a flat sequence of paragraphs and launch buttons, including a redundant Recall entry. It now uses the accepted workspace visual language: one wide primary atomization card and two equal Batch/MOC cards. At narrow pane widths these stack. Each has a description, consequences and an explicit button; cards are not competing click targets. RU/EN, theme tokens, native buttons/focus and Lucide icons are retained.

The primary button opens a native Markdown picker and the consent/preview/write atomization route described in [processing-atomization.md](processing-atomization.md). The independent sidebar keeps list-first review. Batch still owns its selection; the workspace scope is neither supplied nor silently adopted. MOC availability reads the existing saved index; zero clusters offers Deep Audit, loading disables preparation, and a failed read offers retry. Refresh reloads the count after an audit without running another audit. No Recall entry or disclosures are added.

## MOC consent boundary

Previously `generateMOCsFromClusters()` created the folder immediately and called the model for missing descriptions. The shared entry now prepares read-only inputs and asks for explicit confirmation. This protects the command, tools catalog and Processing page equally.

Preparation captures cluster membership/descriptions, normalized target folder, language/model settings and current destination Markdown plus its existing `type: moc` classification. Confirmation shows cluster count, destination, create/update effects, request count, provider/model, sent data (cluster name and up to 30 paths), the existing 200-output-token limit and possible provider charges. It does not expose credentials. Missing model configuration blocks confirmation only when descriptions are missing.

Immediately before execution, preparation is repeated and compared. Changed inputs, target text (even with unchanged mtime), target classification or folder state invalidate consent. Cancel/Escape and plugin teardown of pending preparation perform no writes or requests. Concurrent entries share one pending operation.

The original MOC loop, names, suffixes for handwritten collisions, generated-file updates, per-cluster error handling and cancel notification remain in place. This is consent for the existing generator, not a new transactional writer or Apply/Undo protocol. No model request is made to choose a tool.

## Evidence

`mocPreparation.test.ts` checks cancellation, direct entry points, stale inputs, configuration failures, frozen model requests, handwritten preservation and generated updates. The Health view tests cover all three cards, atomization launch, independent list-first review and Batch selection, empty/loading/error states, retry and stale callbacks.

`scripts/review-flow-native.mjs <new isolated artifact root> <frozen build> processing-before|processing-after` captures full frames and a native route. The after run checks review/Batch/audit navigation, the MOC command, cancel/Escape with zero writes/requests, stale preparation, local creation/update and one explicitly confirmed loopback completion. Original Markdown hashes must remain unchanged. It checks RU/EN, built-in dark/light, 1280/390 px, keyboard, text contrast and 200% Electron zoom. Loopback verifies the real product transport path, not live model quality or billing.

Frozen files, exact source/check results, screenshots, video, installer and limitations are kept together in the permanent artifact report. No personal vault/TEST access, paid calls, dependency/version changes, merge or release are part of this follow-up.
