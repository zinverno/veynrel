# Studio UX follow-up evidence

Frozen runtime source: `e763b1cfa929c75e199e204ce6ee8854e9be4b49`. The evidence/documentation commit does not change runtime files. [Verification metadata](verification.json) binds the build, harness, runtime versions and check counts. Original v1 evidence is retained in the separate `studio-evidence` directory.

- [Native report](native-report.json): 69 checks, 39 full native frames, 17 loopback HTTP calls, 6/6 restored original hashes, no renderer exceptions.
- `beforeApply` records all six hashes before/after generation with the real saved editor open, and the unchanged Vault.process counter (12/12 after previous cases).
- `sameReviewApply` records the same Review UUID and unchanged provider-call count (11/11) across editor refusal/closing/successful Apply.
- [Open saved editor and Review](open-saved-review.png), [Apply refused](open-saved-apply-refused.png), [unsaved buffer refused](unsaved-editor-refused.png).
- [Russian/light/narrow Review](review-ru-theme-light-390.png), plus the full RU/EN × dark/light × 1200/390 matrix for library, consent, review and history.
- [Full tests](tests.txt), [Studio tests](studio-tests.txt), [lint/typecheck/build](lint.txt), [proposal mutation audit](audit.txt).
- [Earlier attempts](earlier-attempts.json) retain failure summaries and raw-report hashes, including native inspector false positives and harness modal readiness/focus failures. Successful runs are identified separately.

The native harness uses a fresh synthetic vault/profile and shared production provider transport to a loopback fixture. It does not access personal vaults, user keys or paid endpoints. Read-only inspectors are observed native UI types; unknown/custom/editable views are blocked. The actual popout, unsaved buffer, normal restart Undo and SIGKILL recovery cases are in the report. Synthetic responses and source quotations do not prove real-model quality. See the [Ollama availability and manual model protocol](../studio-real-model-readiness.md).

Validate from this directory:

```sh
sha256sum --check SHA256SUMS
```
