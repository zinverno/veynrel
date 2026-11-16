# UX-B verification

Runtime: `820d57307fcc65f81a95637dd3e6509e68680519`. Base UX-A: `2bdaebaac032211408f3b8ff6f728940f8b63cfc`. This is the second stacked draft; UX-C is still required. Owner acceptance is not implied.

Notes now opens a bounded, searchable list of actual scoped Markdown paths. A view-owned selection of one note enables the existing tag preparation and optional Atomization/Studio routes; two notes enable the existing local-link plan and Pair Inspector. Exact paths remain visible across filters, paging and Back. No mass write or new executor exists. Repeats, opportunities, saved Review Decisions and the optional map retain their owners. Inactive registered Workspace leaves can be returned to from Studio without relying on their DOM attachment.

Studio remains separate: a handoff offers a path, then an explicit “Use this note only” in recipe setup. It does not read, prepare, send or overwrite an active run. Batch and MOC remain compact auxiliary tools with their original global-scope/consent limits. History uses the existing operation owner; the normal settings menu opens Obsidian's plugin settings. Legacy internal settings routes remain available.

## Engineering

- `npm ci` (offline cache, lifecycle enabled), typecheck, production build, lint: PASS. Only the two existing reviewed fetch advisories remain.
- Full suite on runtime HEAD: **5,423 tests / 212 files**, versus UX-A 5,418. Four RU/EN Notes selection/search/paging/context tests and one Studio return/disposal regression were added.
- Mutation audit **5/5**; native session **2/2**; runner **3/3**.
- Source and journal formats, dependencies, public metadata and consent contracts unchanged.
- Manifest remains published **2.3.1**; development package/lock **2.4.0**; no 2.4.0 compatibility entry or release.

## Native and visual evidence

Real Obsidian **1.13.7**, Electron **43.6.0**, Native frame, private Xvfb/Openbox. [Receipts, screenshots and continuous recordings](evidence/b/README.md). Before screenshots are in [UX-A evidence](evidence/a); after screenshots are in [final](evidence/b/final).

| Scenario | Result |
|---|---|
| Final keyboard contextual journey | PASS, 36 checks, RU/EN, light/dark, wide/390px, reduced motion, real split/popout independent selection |
| Unmodified Minimal theme | PASS, 35 checks; theme/source hash in receipt |
| R05.1 local link | PASS, 23 checks, real Apply/Undo and bytes |
| R05.2 tag from selected Notes + repair | PASS, 67 checks, separate Review/Apply/Undo, exact restored bytes |
| Studio source preservation | PASS, 66 checks, isolated run 02 |
| Recall | 45 checks, exit 0, no exceptions; receipt has no top-level status field |
| Smoke | PASS, 21 checks |
| Private owner-authorized notes-only copy | PASS, 26 checks; 154 Markdown / 3 Canvas byte-identical, zero passive plugin Markdown IO/HTTP; all images and detailed receipts stay outside Git |

Each receipt carries its own asset hashes. Earlier R05 regressions exercised the same action plumbing before the independent Studio Back fix. Final contextual, Studio, Recall, smoke and performance runs use the final runtime assets. The private copy has no real semantic index: **BLOCKED_NO_REAL_INDEX** for semantic quality. Missing attachments limit interpretation of link issues; no claim about the original vault is made.

Original failures remain separate: open-editor refusal; premature harness close of the active leaf; pointer close failure; two verified Studio Back failures before the minimal callback fix. A Studio attempt has a final native PASS report but lacks the outer cleanup receipt after orchestration interruption; it is not counted as a complete isolated PASS. No failure was rewritten, exception filtered or pointer failure converted to keyboard PASS.

## Performance and coverage

One synthetic cold session per size, distinct text. These measurements cover Notes list navigation and search, **not full metadata readiness or semantic computation**. Elapsed time includes CDP dispatch; heap is one renderer snapshot, not a peak or process RSS.

| Files in scope | Cached when list appeared | List transition ms | Search ms | Rendered rows / elements | JS heap bytes |
|---:|---:|---:|---:|---:|---:|
| 1,000 | 45 | 53.3 | 96.0 | 60 / 317 | 60,234,785 |
| 5,000 | 35 | 70.3 | 87.6 | 60 / 317 | 74,140,272 |
| 10,000 | 31 | 55.1 | 102.5 | 60 / 317 | 115,537,597 |

All files remained reachable by search/paging; selection was exact. Indexed/computed semantic documents: **0 / 0**. Cap 500 unchanged. The historical cold 10k full-metadata gate remains open. The 154-note synthetic local check took 525 ms in the recorded Back-fix run; the private copy took 442 ms cold / 314 ms after metadata readiness, retaining its explicit unsupported-target limitations.

Final SHA-256:

```text
main.js       6c348bdb794d742adaaa93029a369d4249077f77293d5689192f3e2479d54d17
styles.css    3c11075ba2ded8190ccda4f7fc930147a0131ca10283a1061b4a2ba7097b0fd9
manifest.json a1c0f8f03004a3d19141ae0bae00f33dcc2a4e6c0e66135d99c0ab419e13a6a1
```

Remaining independent gates: host `e.isShown`, Community document ownership, first-modal/pointer/focus, full cold 10k readiness, custom frame `getZoomFactor`, physical GPU/compositor/IME, screen reader and some partial-cache native cases. The hidden Community feature is still OFF; its ownership defect is not fixed. UX-C must provide the structural mode without embeddings and complete final map acceptance.
