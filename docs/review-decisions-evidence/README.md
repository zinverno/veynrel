# Leave-as-is acceptance

Product/build source: `dd8191ebacc49fa0acf992a6281213de31658514`. Frozen bytes and the installed synthetic-plugin bytes were compared for all three distributed files. Previous beta UI acceptance remains intact; this evidence covers only the completion decision.

- **4,701 tests / 174 files** in the full suite; 98 focused tests after the final copy clarification.
- Typecheck, build and lint passed (0 errors; the existing `api.ts` streaming advisory remains). Mutation audit: 5/5. Diff check clean.
- **28 native checks**, Obsidian 1.13.7 / Electron 43.6.0, 6 synthetic notes, RU/EN, dark/light, 1280/390 px and native Enter activation.
- **0 HTTP analysis requests**. Consent was prepared and cancelled, not sent. No paid diagnostics.
- Frozen `main.js`, `manifest.json`, `styles.css`, SHA256SUMS, SOURCE_COMMIT and the fixed-target bash installer are delivered outside the repository. Installer fixtures preserve the new decision state as well as settings/index/journals; the TEST installer was syntax-checked, never run.

[Continuous 11-second native recording](leave-refresh-restart-restore.mp4): pair → Leave as is → prior scoped/searched list → refresh → real plugin disable/enable → still absent → Reviewed → restore. The screen capture contains real successive native frames, not an HTML demonstration. The plugin restart uses Obsidian’s plugin manager API on this isolated profile.

Useful full frames: [saved confirmation](03-left-unchanged.png), [after restart](06-after-restart.png), [Reviewed](07-reviewed.png), [restored pair](08-restored.png), [save failure](09-save-refused.png), [changed content](10-changed-text.png), [narrow light UI](pair-ru-theme-light-390.png). Additional full frames cover both locales/themes.

`before.json` equals `unchanged-before-content-test.json`: all six Markdown hashes stayed unchanged through save, refresh, navigation, restart, restore, failed save and reverse A/B checks. A **separate subsequent synthetic edit** changes exactly one file in `report.json.afterContentTest`; it is not counted as Undo. Inverse A/B uses the real pair owner with reversed paths; the UI’s normal candidate identity is canonical. Both Repeats and Connections queues suppress the same saved decision. Same basenames are intentionally in different folders.

The first exploratory native probe failed to replace an existing decision file: Obsidian rename refuses an existing destination. The implementation now retains a backup and tests both staging failure and failed replacement/rollback. Only the rerun on the source above is reported as passed.

Not run for this patch: live model requests, physical mobile, third-party themes, split/popout, 200% global zoom, screen-reader speech or power-loss testing. Older broader evidence is explicitly dated in `../final-review-pass-evidence/`; it is not a new run. State is owned by one plugin instance; simultaneous external edits to this plugin state are outside this acceptance.
