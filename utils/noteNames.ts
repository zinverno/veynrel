// === ИМЕНА ФАЙЛОВ И ССЫЛКИ ===
/**
 * Единый санитайзер имени файла: срезает символы, запрещённые в именах
 * файлов и ломающие вики-ссылки, схлопывает пробелы, ограничивает длину.
 */
export function sanitizeFileName(name: string | undefined): string {
  return (name ?? "")
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
}

/**
 * Вики-ссылка на заметку по полному пути: цель однозначна даже при
 * одинаковых именах в разных папках, отображается короткое имя.
 */
export function noteToWikiLink(path: string): string {
  const target = path.replace(/\.md$/, "");
  const base = target.split("/").pop() || target;
  return target === base ? `[[${target}]]` : `[[${target}|${base}]]`;
}

/**
 * Ключ пути: NFC + нижний регистр — совпадает с регистро- и
 * формо-независимыми ФС (Windows, macOS с NFD-именами).
 */
export function pathKey(p: string): string {
  return p.normalize("NFC").toLowerCase();
}
