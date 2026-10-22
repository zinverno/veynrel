# Beta installation and rollback / Установка и откат

Manual installation from the three separate release assets is the supported
beta delivery method. No BRAT dependency or unverified automatic-update claim.
The draft is not yet publicly downloadable; use the checked local kit until
publication is explicitly authorized. A published beta stays opt-in.

## Linux / macOS / Windows

1. Make an independent external backup of the **whole vault and its config**.
   Test on a separate copy. An installer's three-file backup is not this backup.
2. Close Obsidian for that copy, or disable Veynrel before replacing files.
3. Obtain `main.js`, `manifest.json`, `styles.css`, `SHA256SUMS` and
   `SOURCE_COMMIT` from the same release. Check all three SHA-256 values before
   installation. Linux: `sha256sum -c SHA256SUMS`; macOS:
   `shasum -a 256 -c SHA256SUMS`; Windows PowerShell:
   `Get-FileHash main.js,manifest.json,styles.css -Algorithm SHA256`, comparing
   each result with its named line in `SHA256SUMS`.
4. Find the copy's actual Obsidian configuration directory (`.obsidian` by
   default; use the configured override if different). In
   `<vault>/<configDir>/plugins/ai-knowledge-hub/`, back up the previous three
   files **outside the vault**, then replace only those three files. If the
   plugin directory is new, create it. Do not extract over the whole config
   directory. The optional zip contains only those files and this instruction.
5. Reopen Obsidian, enable Veynrel, and verify version **2.2.0**. Use Obsidian
   ≥1.13.7 desktop for this beta. Open **Vault review / Разбор хранилища** from
   the command palette. Choose a scope and refresh the desired candidate list.

These are cross-platform manual instructions, not native test claims for
Windows/macOS. Only Linux desktop was exercised for the beta package.

## Data and rollback

Do not overwrite/delete `data.json`, indexes, Recall state, operation journals,
backups, `review-decisions.json`, `connection-rules.json` or their recovery files.
The package contains none of them and introduces no data migration.

To roll back, stop/disable Veynrel and restore **only the three plugin files**
from the same prior external backup (or the exact prior release's three assets).
For a fresh install, remove only files explicitly recorded as previously absent.
Restart/enable the plugin. Keep new rules, decisions and journals on disk; do not
pretend rollback of code also rolls back data or later formats. For Undo of new
operations, retain a compatible checked build and its journals. Stable 2.1.0
does not expose the later review UI. File replacement is not a three-file atomic
transaction: on interruption, stop Obsidian and restore all three backup files
before using the plugin again.

## Кратко по-русски

Сделайте внешний backup всего vault/config, работайте на копии. Закройте
Obsidian или выключите плагин. Проверьте SHA256 трёх файлов одного комплекта,
сохраните прежние три файла вне vault и замените только их в
`<vault>/<configDir>/plugins/ai-knowledge-hub/`. Учитывайте нестандартный
configDir. Не заменяйте всю `.obsidian`, настройки, индекс, Recall, правила,
решения и журналы. После включения проверьте версию 2.2.0.

Откат возвращает только три файла плагина из прежнего комплекта. Это не откат
данных. Сохраняйте журналы и совместимую проверенную сборку для Undo новых
операций. При частичной установке восстановите все три файла с выключенным
плагином. Локальный TEST-установщик — отдельное удобство для Linux с обычной
`.obsidian`; он не входит в публичный архив и здесь в TEST не запускался.
