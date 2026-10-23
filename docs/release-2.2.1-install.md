# Install / update / rollback — Veynrel 2.2.1

## English

Back up your vault, including the plugin's settings, semantic index, decisions,
rules and operation journals. Finish or cancel pending operations and close the
vault before replacing plugin files.

For Community installations, use **Settings → Community plugins → Check for
updates → Veynrel → Update** once the directory lists 2.2.1. For a manual install,
download `main.js`, `manifest.json` and `styles.css` from the same
[2.2.1 release](https://github.com/zinverno/veynrel/releases/tag/2.2.1), verify
`SHA256SUMS`, and place only these three files in
`<vault>/<configDir>/plugins/ai-knowledge-hub/` (`configDir` is normally `.obsidian`).
Keep the existing plugin directory, data and enabled state. Reopen Obsidian and
enable Veynrel for a new installation. Do not mix builds or create a second ID.

Updating from 2.1.0 or 2.2.0 Beta 1 requires no index regeneration and no automatic
Markdown migration. Existing settings, rules, decisions and journals stay in
place. New analysis/generation still requires its explicit action and consent.

To roll back, close the vault and restore only the previous three plugin files
from one checked build; preserve data, indexes and journals. This rolls back the
plugin, **not Markdown edits**. Use the compatible executor's History and separate
Undo before downgrading after an operation. Stable 2.1.0 cannot provide the newer
Review or consolidation history UI. Keep a compatible 2.2.1 build and its journals
available; never delete journals to force a rollback. Atomization/MOC generation
does not have universal Undo. Restore a complete pre-operation vault backup only
as an explicit user recovery action, taking later edits into account.

## Русский

Перед обновлением сохраните резервную копию хранилища вместе с настройками,
индексами, правилами, решениями и журналами. Завершите или отмените текущие
операции и закройте хранилище. Обновите Veynrel через Community plugins, когда
каталог покажет 2.2.1, либо замените только `main.js`, `manifest.json`, `styles.css`
из одного релиза с проверкой SHA256. ID остаётся `ai-knowledge-hub`; данные
плагина не заменяйте. Новый индекс и автоматическая миграция Markdown не нужны.

Откат заменяет только три файла плагина одной прежней сборкой, не откатывает
Markdown и не удаляет данные. Для отмены поддерживаемой операции сначала
используйте отдельный Undo в совместимой сборке. В 2.1.0 нет нового интерфейса
истории консолидации; сохраните сборку 2.2.1 и журналы. Атомизация/MOC не обещают
универсальный Undo. Восстановление резервной копии хранилища — отдельное решение
пользователя с учётом последующих правок.
