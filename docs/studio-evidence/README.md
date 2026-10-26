# Studio synthetic native evidence

- [native-report.json](native-report.json): 58 completed checks, runtime versions, 16 loopback requests, six before/after Markdown hashes and full screenshot names. Final status PASS, process exit 0.
- [build-info.json](build-info.json): frozen runtime source commit, main.js/styles.css/manifest.json hashes and native-harness hash. Subsequent documentation commits do not change the installed runtime.
- [earlier-attempts.json](earlier-attempts.json): preceding incomplete/failed harness attempts, their completed assertion counts and exact failure diagnostics. These are not substituted for the successful final run.
- `SHA256SUMS`: checksums for every evidence file other than this checksum file itself.
- `verification.json` and text logs: repository check results and the final safety review scope.

Representative full native frames:

| Surface | English | Russian / narrow |
| --- | --- | --- |
| Library | [dark / 1200](library-en-theme-dark-1200.png) | [light / 390](library-ru-theme-light-390.png) |
| Exact consent | [dark / 1200](consent-en-theme-dark-1200.png) | [light / 390](consent-ru-theme-light-390.png) |
| Literal diff | [dark / 1200](review-en-theme-dark-1200.png) | [light / 390](review-ru-theme-light-390.png) |
| History | [dark / 1200](history-en-theme-dark-1200.png) | [light / 390](history-ru-theme-light-390.png) |
| Interrupted Apply | [before manual recovery](interrupted-apply.png) | Recorded separately from confirmed completion. |

System sidebars are collapsed for the responsive matrix. Window widths describe desktop viewport sizes, not a physical phone. Full report and all 35 frames are retained, including both languages, themes and widths. No personal vault data or provider keys are present. Native responses are deterministic test fixtures and say nothing about live model quality. Other OS, physical mobile, screen-reader speech, third-party themes, power-loss and external Sync races were not tested.

To verify evidence integrity, run `sha256sum -c SHA256SUMS` from this directory.
