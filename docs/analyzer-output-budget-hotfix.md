# Relationship Analyzer: completion and output budget

Dependent fix from PR #109, `627c753c677a33da4980a67c8267b9560efccfd3`.
The standalone list remains the entry point; no map or simulation is mounted.

The reported OpenRouter statistics show `finish_reason: length` and 4000 native
completion tokens, all attributed to reasoning. They are **not** a captured
chat/completions response: the original `message.content` is unknown. Before this
fix, the parser rejected null content before reading the finish reason, and could
accept partial text without checking that generation completed.

## Transport and consent

- A structurally valid choice with `length` fails with `outputLimit`, including
  null, empty, missing, partial or apparently complete JSON content. No planner
  authority is created. Broken envelopes remain `invalidEnvelope`.
- Relationship Analyzer requires explicit `stop`. Missing/null/unknown finish
  reasons and unsolicited tool calls fail as `unexpectedCompletion`; refusals
  and content filtering fail as `refused`. Provider/HTTP/network errors remain
  separate. `stop` with null/empty text is `emptyResponse`.
- Successful final text passes the unchanged strict JSON/evidence validator.
  No reasoning fields, JSON repair, input truncation, retries, continuations or
  model fallback are used. Usage counters are deliberately not surfaced: absent
  or malformed usage cannot produce invented counts or a reasoning-only claim.
- Streaming accepts null/empty intermediate deltas but does not treat them as
  final output. Explicit length/refusal/tool/error completions reject. Existing
  incremental delivery, timeout/cancel and cleanup behavior remains covered.
  Non-analyzer clients retain their request defaults and legacy tolerance of an
  omitted finish reason; they also reject explicit unsuccessful completions.
- One pure policy produces frozen options during preparation. The preview and
  dispatch use the same builder, settings snapshot, full input and frozen options.
  Tests and native loopback capture compare serialized bodies byte-for-byte.
  Settings/source/navigation changes revoke consent; one confirmation permits
  one dispatch. The 120-second timeout is unchanged.

## Bounded policy

Only Relationship Analyzer requests use `max_tokens: 8192`, `temperature: 0`:

| Destination | Reasoning request |
| --- | --- |
| OpenRouter `deepseek/deepseek-v4-flash-0731` or its canonical `deepseek/deepseek-v4-flash-20260731` | `{ "enabled": false }` |
| Other selected OpenRouter models | `{ "effort": "low" }` |
| Other API profiles | No OpenRouter reasoning fields |

8192 is a fixed engineering ceiling for reasoning plus final output, not a
guarantee of completion. Low effort is not a hard reasoning-token budget and may
be unsupported by another model. Such rejection is surfaced without fallback or
retry. The consent visibly states the ceiling and requested reasoning mode.
No provider is pinned; `reasoning.exclude` is not used as a substitute for disabling
reasoning. Other tools retain their budgets. The separately authorized historical
evaluation runner explicitly retains its old 4000-token control budget in its
adapter; this product change does not silently enlarge an experiment's approval.

Official sources checked without credentials or inference calls on 2026-10-22:

- [Reasoning controls and per-model metadata](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).
- [Public model catalogue](https://openrouter.ai/api/v1/models): the exact 0731 ID
  reports `mandatory: false`, `default_enabled: true`, `default_effort: high`,
  `supported_efforts: [max, high, low, none]`. It does not advertise a hard
  reasoning-token cap. This is stronger evidence than `supported_parameters` alone.
- [Model endpoints](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints)
  include reasoning support on the reported Baidu route. Per-endpoint effort
  guarantees are not supplied; actual compliance is **not live-tested**.
- [Response schema and finish reasons](https://openrouter.ai/docs/api_reference/overview).

## Verification and limits

Synthetic HTTP fixtures cover null/empty/missing/partial/apparently complete
length responses, successful stop, malformed envelopes, refusal/tool/provider
errors, unknown completion, invalid usage, strict quote/evidence rejection,
consent equality, policy changes, double click, timeout/cancel and late responses.
The regression traverses the actual builder → requestUrl boundary mock → parser
→ RelationshipSession → strict validator → shared pair UI. Five new length
regressions were observed failing against the previous implementation.

Native harness: `scripts/analyzer-output-budget-native.mjs`, fresh isolated vault
with two synthetic notes and artificial index vectors. A loopback HTTP server
returns one reasoning/length envelope and one final structured response. Native
`requestUrl`, parser, session, validator, planners, exact review, Apply, history and
separate Undo are all real. No completion/result function is replaced.

Native checks, screenshots, recordings, Markdown hashes and frozen build identity
are supplied with the delivery evidence. No paid request or personal/TEST vault
installation is performed. Native transport integration does **not** prove live
DeepSeek success or embedding quality. Mobile, screen reader and third-party themes
are not re-tested by this narrow patch. Stage 1 UX and map A/B remain unaccepted.

Local verification: 4614 tests / 168 files, both typecheck projects, lint/build and
diff-check passed. Proposal mutation audit: 5/5 killed, restored tests passed.
The pre-existing streaming `fetch` advisory remains; no new lint warnings.
Independent read-only review found no required changes. The synthetic installer
test passed three-file replacement/backup and tamper/original/symlink refusal.

Native smoke passed 11 checks in Obsidian 1.13.7 / Electron 43.6.0. There were two
loopback HTTP requests, both matching consent; no automatic retry, no map. The
only two Markdown writes were Apply and Undo. Both original hashes were restored
by the actual Undo executor. The complete error/consent and success/Apply/Undo
recordings are synthetic integration evidence, not a live provider run.

Frozen source: `b17ba8cb32e1049622667c1b43012deebaeaa2e1`.
[Native screenshots, recordings and integrity evidence](analyzer-output-budget-evidence/README.md).
Final review HEAD and exact-head CI are recorded in the PR and frozen delivery metadata.
