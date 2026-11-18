# UX-B: contextual operations

Base: UX-A `2bdaebaac032211408f3b8ff6f728940f8b63cfc`, stacked on #152 / #151.

| Existing surface | New location | Preserved owner | Change / boundary |
|---|---|---|---|
| Review list | Notes: files, repeats, connections | WorkbenchData / ReviewDecisions / ReviewFacts | Bounded real-path file list; candidate and reviewed queues retained |
| Tag picker | Selected single note | ObsidianLocalNote / SafeApplyService | Exact path handoff; same rules and saved-note guards |
| Local link | Selected pair | LocalLinkModal / SafeApplyService | Direction and range remain explicit; no write on selection |
| Pair Inspector | List / selected map pair | existing PairReviewPort | Same consent and source revisions; Back retains browser state |
| Atomization | Selected note / compact tools | existing atomizeNote | No generic bulk executor |
| Batch / MOC | Compact auxiliary menu | existing Batch / saved clusters | Global scope stays explicit; no single-note bulk claim |
| Studio | Separate Studio leaf | registerStudio / RecipeRunner | Suggested path only; explicit use in recipe setup, no automatic preparation |
| History | Contextual actions / menu | existing operation history | No new persistence |
| Settings | Obsidian plugin settings | existing setting tab | Legacy internal settings routes remain compatible |

Presentation selection is view-owned, filtered on scope replacement; it is neither a decision nor a write ticket. No journal, embedding, FSRS or reconciliation changes. Invalid/stale files are refused by the existing executors. No new rules source.
