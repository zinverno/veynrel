# Veynrel Connect

Connect productizes the existing Veynrel Companion integration. It does not add a
server, protocol, MCP tool, mirror, or proposal application. The normal workspace
navigation is **Health | Findings | Discover | Recall | Connect | Tools | Settings**. All seven routes
use `VeynrelHealthView`; `{ page: "connect" }`, forms and confirmations are
transient. Reopening Veynrel starts on Health. The [final product IA](product-ia.md)
organizes existing manual tools and configuration without duplicating Connect.

Connect is an integration surface, not a Health dimension. Structure,
Connections, Recall and Knowledge remain the four Health dimensions.

## Roles and ownership

```text
Obsidian / Veynrel
  ConnectController (one plugin-lifetime product owner)
    CompanionSettingsPort -> AIHubSettings.companion -> shared settings-save queue
    ConnectEnginePort -> existing ObsidianSemanticController
                          -> existing CompanionSyncService
                          -> existing CompanionClient transport
           |
           v
Veynrel Companion: persistent semantic mirror and proposal queue
           ^
           |
External MCP clients and agents

Connect Review action / existing command
  -> plugin.openProposalReview()
  -> existing cached ProposalApplication + ProposalReviewModal
  -> explicit Obsidian approval -> guarded Vault mutation
```

`health/connectPort.ts` owns the sanitized product contract. The implementation
in `connect/product/` has no Vault, HTTP transport, provider, analysis or storage
capabilities. `main.ts` constructs the owner once and injects a narrow engine
adapter into it. Every mounted view subscribes to this owner; closing one view
removes only its subscription.

The Semantic controller retains its existing, single Companion service and sync
queue. `rawTestCompanion` and `rawSyncCompanion` are shared primitives. The
Advanced connection controls still wrap those operations with Notices. Candidate
tests use the same service without publishing candidate-only status into the
committed/background service state.

`CompanionSyncService.subscribeStatus` publishes tests, reconciliation,
incremental synchronization, errors and configuration invalidation. Subscriber
exceptions cannot fail work. The adapter also forwards cached Semantic status
notifications for the index prerequisite, without probing or loading the index.
There is no polling or pending-proposal badge.

## Connection, mirror and proposals

These are independent concepts:

| Concept | Meaning | Explicit action |
| --- | --- | --- |
| Connection | The current Companion configuration has answered a status request in this runtime | Connect or Check connection |
| Mirror | The existing semantic representation has been synchronized to Companion | Sync now, then Synchronize mirror |
| Proposals | Agents have queued suggested note changes on Companion | Review proposed changes |

Disabled settings show **Disabled**. Enabled invalid settings show **Needs setup**
without being reset. Valid enabled settings start as **Configured**, with no
automatic test. **Connected** is transient and associated with the exact enabled,
endpoint, token, timeout and Vault identity configuration. A check does not imply
that the mirror is synchronized. A missing usable Semantic index is a mirror
prerequisite, not a connection failure.

During an explicit or background operation the UI shows **Connecting…** or
**Synchronizing…**. A Companion failure shows bounded, localized copy for invalid
configuration, rejected authentication, protocol mismatch, timeout/unreachability
or server failure. Raw responses, headers and stacks are never displayed.

Mirror status becomes synchronized only after a full reconciliation succeeds in
this session. Later successful incremental batches preserve that knowledge;
a partial batch alone cannot establish it. A failed sync or configuration change
clears it. The display does not prove that an operator has retained the mirror,
that clients have access, or that MCP is configured.
Last success is an in-memory display timestamp, not another persisted setting.

## Setup and credentials

Companion must already be running. **This device** defaults to
`http://127.0.0.1:27124`; users need not type it. Existing custom local addresses
remain editable in Advanced Settings and are preserved when editing the current
mode. **Remote server** takes an endpoint and token. It uses the existing client
security policy: non-loopback HTTP is invalid; remote endpoints require HTTPS;
userinfo, query strings and fragments are rejected.

The required **Companion token** is the existing plugin-to-Companion bearer token.
It appears only in the intentional password editor, with autocomplete disabled.
It is stored in the existing plugin `data.json`. No new credential file exists.
Drafts for another mode start with an empty token; editing the remote endpoint
clears the draft token instead of forwarding a saved credential to another server.

External MCP clients authenticate to Companion separately. The plugin does not
expose or manage their MCP token and has no MCP-token field. Companion's operator
configures those credentials on the server.

The public snapshot and view model contain no token, Vault UUID, authorization
header, note content or vectors. Endpoint presentation uses a bounded origin
label, excluding URL userinfo, paths, query and fragment. Internal configuration
identity and draft-origin checks are never published.

## Shared transactional settings

`CompanionSettingsPort` reads copies of `AIHubSettings.companion` and writes through
the existing serialized `settingsSave` queue. Simple setup owns only `enabled`,
`endpoint` and `token`. It preserves Advanced `timeoutMs` and the stable random
`vaultId`; Connect neither regenerates nor prominently displays that identity.

Connect validates a candidate using the exact client validator, performs only
the existing bodyless `GET /v1/status`, then persists with an expected-configuration
check. Only successful persistence permits candidate Ready. A failed test saves
nothing; a failed save leaves the committed in-memory configuration intact and
the setup form retryable. Check tests the current settings and writes nothing.

Advanced controls publish edits immediately, without network. Expected-value
checks run before persistence and after `saveData` returns. If Advanced changed
Companion while the candidate write was in flight, the queue corrects disk using
current settings and rejects the obsolete candidate. A subsequently queued
Advanced save remains available even if that corrective write fails. No stale
whole-settings snapshot replaces concurrent Health, Semantic, Deep or UI edits.

The existing Companion object reference is preserved for Advanced controls.
Enabled, endpoint, token and timeout controls remain available; the existing
timeout setting is now exposed explicitly as a bounded numeric Advanced field.

## Synchronization and data disclosure

Opening Connect and creating or cancelling a sync confirmation perform no network
request, mirror capture, proposal listing or Markdown read. Only **Synchronize
mirror** starts the existing snapshot/reconciliation path. Confirmation is bound
to the exact configuration and is single use. Navigation discards it. A settings
change during capture prevents that snapshot being sent to a newly selected
server.

The mirror contains the existing protocol fields:

- Stable Vault identity.
- Vault-relative note paths.
- Markdown content.
- Chunk text.
- Note, chunk and source metadata.
- Embeddings.
- Semantic descriptor metadata.

Synchronization captures the existing Semantic runtime's mirror, obtains the
server reconciliation plan, and applies the existing bounded/retried batches.
Reconciliation may delete obsolete mirror entries through the existing protocol.
It does not modify local notes, reconfigure embeddings or silently build an index.
An absent/disabled Semantic index must be prepared through the existing Semantic
workflow. Cached state after restart is not proof that the on-disk index is absent;
the UI directs users to Discover to check or build it.

For **This device**, only the configured Companion endpoint is identified as
local. Embedding and Companion search providers can still use remote services;
the UI does not promise that the whole workflow is offline. For **Remote server**,
setup and confirmation explicitly disclose transmission and storage on that
server and require a trusted HTTPS endpoint.

Enabling Connect is not just permission for one upload. Existing future Semantic
changes after actual Markdown activity or index commits may continue incremental
mirror synchronization. Setup and the mirror section disclose this. PR #41's
startup deferral remains: startup itself does not sync or read Markdown.

Failed synchronization leaves local notes and the local index intact. It may
leave previously completed remote batches in place; Connect does not claim to
roll back remote data. Background status is observable in every mounted view.

## Disabling and server data lifecycle

**Disable sync** persists `enabled = false` while preserving endpoint, token,
timeout and Vault identity. Configuration invalidation drops obsolete queued
Companion work. Already issued HTTP work may finish; future synchronization stops.
Disable uses an enabled-only patch inside the same save queue, so it also wins
over an older in-flight Simple Connect save without restoring old credentials.
Older Connect intent cannot publish Ready after that explicit Disable action.

Disabling does **not** delete the stored server mirror or revoke server-side MCP
credentials. Companion's operator controls data retention, backups, credential
revocation and deletion. Connect adds no remote deletion API or administration UI.

## MCP capabilities and proposal safety

The capability list describes protocol v1 when Companion's MCP endpoint is
configured. It does not negotiate or claim individual client permissions.
External clients can obtain Vault status, list/read mirrored notes, read chunks,
perform semantic search, and submit/retrieve proposals. They read the Companion
mirror, not live Obsidian memory.

Existing `CREATE_NOTE`, `UPDATE_NOTE` and `DELETE_NOTE` proposals change nothing
by themselves. External agents cannot directly write notes through this workflow.
Only explicit review and approval in Obsidian may apply a proposal.

Connect and command `review-ai-change-proposals` call the same plugin operation,
which reuses one cached `ProposalApplication` per configuration signature and the
existing `ProposalReviewModal`. Opening the Connect page performs no proposal
request. Opening review explicitly may list/fetch proposals and read local content
for preview, but preview makes no mutation.

Approval retains claim leases, base-content hashes, exact base-content comparison,
path validation, explicit approval, single-flight application, post-write
verification and completion acknowledgement. Reject remains remote rejection
only. None of the approval implementation or protocol fixtures is changed.

## Isolation and limitations

Connect creates no Health Finding, ScanRun, receipt, Recall inventory/review/storage
operation, Deep connection test or Knowledge analysis. Connecting and checking
send no language-model or embedding provider credentials. Sync reads only the
established mirror path; ordinary Semantic indexing remains separately explicit.

This PR does not install/manage Companion, configure external MCP clients, add
accounts, telemetry, tools/endpoints, automatic approval, a new authentication
protocol, Qdrant/index changes, or a release. Protocol version remains 1.
Already issued Connect/Check operations can finish after navigation; route and
epoch checks prevent detached forms or confirmations reappearing.

## Verification

Automated coverage includes legacy/passive states, exact request shape, typed
failures, transactional persistence and Advanced races (during test and write),
unrelated settings, confirmation binding/cancellation, background subscriptions,
two views, secret-free snapshots/DOM, shared proposal review and mirror-capture
configuration races. Existing Companion/proposal/Semantic/Health tests and the
proposal mutation audit remain authoritative.

| Check | Result |
| --- | --- |
| Full test suite | 2,309 tests, 94 files passed |
| Connect controller, settings and boundaries | 50 tests, 3 files passed |
| Companion / proposals | 57 / 58 tests passed |
| Semantic / Health | 347 / 819 tests passed |
| Proposal mutation audit | 5/5 mutations killed |
| Existing real sibling compatibility smoke | 10/10 passed |
| Install, both type checks, scoped ESLint, plugin lint, production build | Passed; one existing streaming `fetch` warning |
| Native assertions / layout cases | 98 distinct assertions / 60 layout cases passed |

Native evidence is in [veynrel-connect-evidence/native.json](veynrel-connect-evidence/native.json).
The disposable real Obsidian fixture used synthetic notes and tokens with the
existing built sibling Companion at `62ff1b6ed0fd04290e6ab00216d5c6b51d94db5c`.
No sibling repository files were changed. Local status/sync, real MCP read/search,
proposal Reject and exactly-once Approve, Advanced live edits, two views, late
completion, passive restart and EN/RU dark/light layouts were exercised.
The final build was replayed on real Obsidian 1.13.7 / Electron 39.8.10, including
the two-view Disable/save race, full and incremental synchronization, real MCP
retrieval/search, Reject and exact Approve. Installed build hashes match the
implementation commit recorded in the evidence. The 60 layout cases cover
320px, 390px and 960px in both languages and themes. A Health cold-import timeout
under parallel verification load passed unchanged when rerun independently.

Screenshots: [desktop](veynrel-connect-evidence/overview-en-dark-desktop.png),
[390px overview](veynrel-connect-evidence/overview-en-dark-390.png),
[remote confirmation](veynrel-connect-evidence/remote-confirmation-en-dark-390.png),
[Russian local setup](veynrel-connect-evidence/local-setup-ru-light-390.png).

The remote HTTPS fixture redirected its test transport to the disposable local
Companion; it verifies endpoint policy and remote-storage disclosure, not live
Internet TLS or a remote deployment. Embeddings/search used a local deterministic
synthetic provider. Native mobile, popouts, screen readers, custom themes and
Qdrant are not certified by this desktop smoke. Existing development dependency
audit findings and the reviewed streaming `fetch` lint warning remain separate.
