# Veynrel visual identity

**Core visual identity: completed.** The final maintainer-approved Veynrel artwork is included unchanged. The README displays the approved Veynrel cover directly below its heading and retains the migration, compatibility, privacy and funding information.

## Final artwork

| Asset | Dimensions | Use |
| --- | --- | --- |
| `assets/brand/veynrel-logo.png` | 1254 × 1254 | Product logo. |
| `assets/brand/veynrel-community-icon.png` | 1024 × 1024 | Obsidian Community Plugin icon. |
| `assets/brand/veynrel-readme-cover.png` | 1672 × 941 | Current README hero. |
| `assets/brand/veynrel-social-preview.png` | 1280 × 640 | GitHub repository social preview. |

Only these four final artwork files are included. Boosty banner and avatar files remain external profile assets; they are not needed in the plugin repository. Veynrel is the product identity, separate from the maintainer's personal identity. The maintainer's personal GitHub avatar is unchanged.

## Manual profile updates

- After merge, upload `assets/brand/veynrel-social-preview.png` through the repository's GitHub Settings → Social preview. Committing the file does not update that setting.
- After merge/release, update the Community Plugin icon through the relevant Obsidian Community Directory management UI if it is not sourced automatically from the repository, using `assets/brand/veynrel-community-icon.png`.

## Retained assets

| Asset | Classification | Current treatment / follow-up |
| --- | --- | --- |
| `assets/vault-audit-ai-cover.png` | 4 — historical artwork with old branding | Intentionally preserved as the previous product cover; not rendered in the current README. Superseded by the final Veynrel cover above. |
| `assets/vault-audit-semantic-search-demo.gif` | 3 — useful demo with old visible branding | Preserved, but removed from current README presentation. Opening command-palette frames visibly say Vault Audit AI; search/results are otherwise reusable. An optional future Veynrel recording can replace this historical demo. |
| `assets/.gitkeep` | 1 — brand-neutral | Keep. No visual content. |
| `docs/premerge-evidence/*.png` | 4 — historical evidence | Keep unchanged, including old settings branding. |
| `docs/extraction-evidence/*.png` | 4 — historical evidence | Keep unchanged as extraction test evidence. |
| Native screenshots under `docs/veynrel-release-evidence/` | 1 — current product evidence | Veynrel text with the existing neutral brain/sparkles icons. |
| Existing Obsidian/Lucide icons and CSS selectors | 1 — brand-neutral | Reuse. Preserve `ai-hub-*` selectors for themes/snippets and tests. |

Inspection covered the cover and GIF start, search, results and navigation frames, including the old-name command palette around frames 8–20 (123 frames total). Filenames alone were not a reason to remove assets. Both original assets remain available in Git.

**Release blocker: no.** Core artwork is complete and the current README presents only Veynrel artwork. The manual profile updates and optional demo refresh do not change plugin behavior or compatibility.
