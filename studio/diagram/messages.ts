import { errorMessage, l } from "../messages";
import { StudioError } from "../recipe";
import { DiagramError } from "./spec";

const errors: Record<string, [string, string]> = {
  spec: ["The response is not a valid DiagramSpec v1 graph, or has no nodes. Nothing can be created. No automatic repair request.", "Ответ не соответствует DiagramSpec v1 либо не содержит узлов. Создание недоступно. Автоматического запроса для исправления нет."],
  limit: ["The diagram exceeds a limit: 30 nodes, 60 edges, label lengths or bounded canvas. Nothing was silently removed.", "Схема превышает лимит: 30 узлов, 60 связей, длина подписей или размер холста. Ничего не удалено молча."],
  unavailable: ["Enable the optional Obsidian Excalidraw plugin to create diagrams. Studio does not install or enable it automatically. Other Studio features remain available.", "Для схем нужен включённый плагин Obsidian Excalidraw. Studio не устанавливает и не включает его автоматически. Остальные функции Studio доступны."],
  reloaded: ["Excalidraw was reloaded after this preview. Update the preview locally and confirm the new Review; no model request is needed.", "Excalidraw перезагружен после предпросмотра. Обновите предпросмотр локально и подтвердите новый Review; запрос к модели не нужен."],
  incompatible: ["This adapter supports Excalidraw 2.29.0. Also turn off its automatic .excalidraw export before creating/opening here. Studio does not change global settings.", "Адаптер поддерживает Excalidraw 2.29.0. Также отключите автоматический экспорт .excalidraw перед созданием/открытием здесь. Studio не меняет глобальные настройки."],
  adapter: ["Excalidraw could not build or verify the native scene. Check its availability and inspect history after a creation attempt.", "Excalidraw не смог построить или проверить нативную сцену. Проверьте доступность плагина и историю после попытки создания."],
  path: ["Enter an exact visible vault path ending in .excalidraw.md, inside an existing folder. Hidden/service paths, traversal and ambiguous names are not allowed.", "Укажите точный путь внутри vault с окончанием .excalidraw.md, в существующей папке. Скрытые/служебные пути, выход из папок и неоднозначные имена запрещены."],
  occupied: ["This filename or a case/Unicode equivalent is occupied. Choose another exact path and update Review; Studio never renames or overwrites automatically.", "Имя или его эквивалент по регистру/Unicode уже заняты. Выберите другой точный путь и обновите Review; Studio не переименовывает и не перезаписывает автоматически."],
  "source-link": ["The source link cannot resolve unambiguously. Source names containing brackets, |, # or ^ are unsupported in v1.", "Не удалось однозначно разрешить ссылку на источник. Имена с квадратными скобками, |, # или ^ не поддерживаются в v1."],
  open: ["The drawing was created, but could not be opened. Retry opening from history; this never creates another file or model request.", "Рисунок создан, но открыть его не удалось. Повторите открытие из истории; это не создаёт новый файл и не обращается к модели."],
};
export function diagramError(code: string): string { return errors[code] ? l(...errors[code]) : errorMessage(code); }
export function diagramMessage(e: unknown): string { return diagramError(e instanceof DiagramError || e instanceof StudioError ? e.code : "storage"); }
export function diagramStatus(state: string): string {
  const values: Record<string, [string, string]> = {
    created: ["Created and scene verified", "Создан, сцена проверена"], "not-created": ["Not created", "Не создан"],
    unconfirmed: ["Creation outcome is unconfirmed — inspect history; no automatic retry", "Исход создания не подтверждён — проверьте историю; автоматического повтора нет"],
    "changed-unavailable": ["Result later changed or is unavailable", "Результат позже изменён или недоступен"], damaged: ["Journal evidence is damaged", "Данные журнала повреждены"],
  };
  return values[state] ? l(...values[state]) : state;
}
