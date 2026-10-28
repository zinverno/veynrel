import { currentLanguage } from "../i18n";
export const l = (en: string, ru: string): string => currentLanguage() === "ru" ? ru : en;
const statuses: Record<string, [string, string]> = {
  idle: ["No active operation", "Нет активной операции"], preparing: ["Reading selected saved notes", "Чтение выбранных сохранённых заметок"], prepared: ["Review the outgoing data", "Проверьте отправляемые данные"],
  generating: ["Generating sequentially", "Последовательная генерация"], review: ["Review proposals before writing", "Проверьте предложения перед записью"],
  applying: ["Applying selected changes", "Применение выбранных изменений"], partial: ["Partially completed — inspect each file", "Частично выполнено — проверьте каждый файл"],
  completed: ["Finished", "Завершено"], failed: ["Failed", "Ошибка"], cancelled: ["Stopped; already sent requests may still be billed", "Остановлено; уже отправленные запросы могут быть оплачены"],
  interrupted: ["Interrupted; no automatic retry", "Прервано; автоматического повтора нет"], generated: ["Generated — human review required", "Сгенерировано — требуется проверка человеком"],
  applied: ["Applied and verified", "Применено и проверено"], undone: ["Undo verified", "Отмена проверена"], skipped: ["Skipped", "Пропущено"],
  conflict: ["Conflict — no overwrite permitted", "Конфликт — перезапись запрещена"], unconfirmed: ["Unconfirmed — inspect recovery", "Не подтверждено — проверьте восстановление"],
  damaged: ["Damaged evidence — writing blocked", "Повреждены данные — запись заблокирована"], replace: ["Replace", "Заменить"], append: ["Append", "Добавить в конец"],
};
export function status(value: string): string { const pair = statuses[value]; return pair ? l(...pair) : value; }
const errors: Record<string, [string, string]> = {
  recipe: ["Invalid recipe. Only schema v1, one llm_transform step and Markdown replace/append are supported.", "Некорректный сценарий. Поддерживается схема v1, один шаг llm_transform и Markdown replace/append."],
  parameters: ["Check the language, instruction length and context budget (1,024–262,144).", "Проверьте язык, длину инструкции и бюджет контекста (1 024–262 144)."],
  scope: ["Select 1–20 existing Markdown files. Folder selection includes subfolders; nothing is silently sampled.", "Выберите 1–20 существующих Markdown-файлов. Папка включает подпапки; выборка не сокращается автоматически."],
  size: ["Input or request exceeds the declared limit, or the note is empty/invalid. Nothing was truncated. Select a smaller note or verify the model's context budget.", "Вход или запрос превышает лимит либо заметка пуста/некорректна. Текст не обрезан. Выберите меньшую заметку или проверьте бюджет контекста модели."],
  source: ["The saved source changed, moved, disappeared or could not be read. Prepare a new run.", "Сохранённый источник изменён, перемещён, удалён или недоступен. Подготовьте новый запуск."],
  editor: ["Before writing, save and close all affected note tabs, including popouts. Obsidian cannot rule out queued saves. If no Apply operation has started, confirm the same review again after closing; no new model request is needed.", "Перед записью сохраните и закройте все вкладки затронутых заметок, включая отдельные окна. Нельзя исключить отложенное сохранение. Если операция Apply ещё не началась, после закрытия подтвердите тот же Review повторно; новый запрос к модели не нужен."],
  unsaved: ["An open editor differs from the saved note. Save it, wait for saving to finish, then prepare the request again. Studio will not silently send an older version.", "Текст открытого редактора отличается от сохранённой заметки. Сохраните её, дождитесь окончания сохранения и подготовьте запрос заново. Studio не отправит устаревшую версию молча."],
  "read-editor": ["Studio cannot verify an affected editor. Let the note finish loading in a standard Markdown view, save it, then prepare again. No data was sent for this note.", "Studio не может проверить редактор выбранной заметки. Дождитесь загрузки в обычном Markdown-редакторе, сохраните её и повторите подготовку. Данные этой заметки не отправлены."],
  settings: ["Model settings are invalid or changed after preparation. Configure the existing language model settings and prepare again.", "Настройки модели некорректны или изменились после подготовки. Проверьте существующие настройки языковой модели и подготовьте запуск заново."],
  busy: ["Another Studio operation is active. Wait or stop it in Run.", "Другая операция Studio уже выполняется. Дождитесь её или остановите во вкладке запуска."],
  stale: ["This confirmation is stale. Prepare a fresh review.", "Подтверждение устарело. Подготовьте новый просмотр."],
  storage: ["Storage could not be verified. Inspect history and preserve the Studio folder. Damaged journals never authorize writes or Undo.", "Не удалось проверить хранилище. Проверьте историю и сохраните папку Studio. Повреждённый журнал не разрешает запись или Undo."],
  response: ["The response is empty, oversized or invalid. No applicable proposal was produced.", "Ответ пуст, превышает лимит или некорректен. Предложение для применения не создано."],
  provider: ["The provider failed, refused, timed out or did not confirm a complete response. No automatic retry; an issued request may still be billed.", "Провайдер вернул ошибку, отказ, таймаут или не подтвердил полный ответ. Автоматического повтора нет; отправленный запрос может быть оплачен."],
  cancelled: ["Stopped. Existing confirmed writes remain in history; an already issued provider request cannot be recalled.", "Остановлено. Подтверждённые записи сохранены в истории; уже отправленный запрос нельзя отозвать."],
  used: ["This confirmation was already consumed. Refresh history.", "Это подтверждение уже использовано. Обновите историю."],
  conflict: ["The source or operation evidence changed. Studio will not overwrite it; inspect the current note and prepare a new review.", "Источник или данные операции изменились. Studio не перезапишет их; проверьте заметку и подготовьте новый просмотр."],
};
export function errorMessage(code: string): string { return l(...(errors[code] ?? errors.storage)); }
