# Validation and native evidence

Base: `4ef4d2893c944467657f9b54a64d826fb9f96e84` (origin/main fetched before work; PR #127 merged). Isolated branch: `feat/studio-source-preservation-v1`. Runtime/source commit: `9c5b55491ab9e4462a10d4b59b5011ce9ce1ec16`. The final documentation commit is identified in the PR/review manifest.

Final production build SHA-256:

```
c8549e2af58e5d93a14ecb8f2f75fe0d59d6204a2145404eb948a6d638b684d9  main.js
0a56930f3846b7c4ff047a63aaddf4dd471624df91a2bb0388b85bde5c561c71  styles.css
03001af2b852b53a31721fee83b353ad2d6496f55d327c150f0540bb5371c93b  manifest.json
```

All accepted native suites below use these exact product bytes. Obsidian 1.13.7 / Electron 43.6.0, isolated disposable profiles/vaults, actual native UI/Vault/transport, synthetic loopback only. Excalidraw 2.29.0 is installed only for diagram regression. Markdown source preservation passes with Excalidraw absent. Diagram preflight uses production strict JSON Schema and a harness-only URL/header adapter to local fixtures; request bodies remain byte-identical to confirmed production bodies.

| Gate | Result |
| --- | --- |
| `npm test -- --maxWorkers=4` | 5144 tests, 191 files PASS |
| `npm run typecheck`, `npm run build` | PASS |
| `npm run lint` | PASS; only the two unchanged, reviewed fetch advisories |
| `npm run audit:proposals` | 5/5 mutations killed; restored tests PASS |
| `git diff --check` | PASS |
| Source Preservation native | 23 checks PASS; 9 synthetic requests |
| Existing Markdown native | 83 checks PASS |
| Community native, local catalog only | 39 checks PASS |
| Diagram native | 35 checks PASS; 7 synthetic requests |

[Source-preservation report](evidence/native-report.json), [Markdown report](evidence/markdown-regression.json), [Community report](evidence/community-regression.json). Actual UTF-8 source/result/Undo files are in `evidence/markdown/`, alongside exact plans, checks, a receipt-failure partial result, native screenshots and logs. Review ZIP adds a browsable relative-resource HTTP gallery and independent local smoke kit.

Verified native paths include default separate-note save, exact shown/written payload, source BOM/CRLF/YAML preservation and Undo hashes, saved/unsafe editors, selected-only batch, receipt failure, restart without replay, manual receipt-only recovery, separate source-mode open, RU/EN/light/dark/390/normal widths, real split/popout, keyboard actions and shared operation guards. Passive viewing/name/destination/theme changes cause no model request, note read/write or journal write. Original/control hashes remain unchanged at completion.

## Failed attempts retained

`evidence/attempts.json` retains early Source Preservation failures, including the real `Vault.read` BOM loss that required the binary-aware read, native editor normalization outside Studio, an outdated harness route expectation, mid-animation sidebar width measurement and missing CDP Enter keypress. No failed run is counted as accepted. The final Enter trace records keydown/keypress/click/keyup. There were no renderer exceptions in any of the four accepted native suites.

The first existing Markdown run exposed a real UI regression: preflight refusal emitted while the shared operation gate was busy, hiding the actionable Review button. The final implementation emits after gate release; a unit assertion and the unweakened 83-check native suite cover the fix. All old guard/fault assertions remain; old internal Apply tests use bracket access after the public path became plan confirmation. The size-limit fixture now sets a truthful byte stat, preserving its original rejection assertion.

The first diagram run reached editable native shapes but stopped at text-edit completion. Its failure is preserved in `evidence/diagram-first-attempt.json`. The harness now supplies native Ctrl+A/Escape keycodes; it still verifies actual edited text, arrows, dragging, save/reopen and unchanged source hashes. No production diagram/viewport or zoom implementation changed. A passing run does not claim to fix a previously observed zoom error; captured exceptions are reported explicitly.

The initial restricted-shell mutation audit hit `spawnSync EPERM`, not an assertion surviving a mutation. It was rerun with the same unchanged audit under the permitted local execution context; all five mutations were killed. No guard/test was disabled to obtain a pass.

## Not evaluated

Real-model format/meaning/usefulness remains **NOT RE-EVALUATED**. No remote inference, credentials/key-file access, paid call or new charge occurred. This is workflow/protocol evidence, not semantic quality. Physical mobile, screen-reader speech, arbitrary third-party hooks, cross-process filesystem races, arbitrary encodings and owner manual acceptance are NOT RUN. No merge/release/deploy, catalog/site change or automatic user installation occurred.
