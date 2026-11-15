import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en" }));
import { setLanguage } from "../i18n";
import { reviewRowLabel } from "./messages";

afterEach(() => setLanguage("en"));

const languages = [
  { language: "en", draft: "Draft for a separate note — source unchanged · Generated", prefix: "Proposed source action:", generated: "Generated", replace: "Replace", append: "Append", created: "Separate note created", applied: "Applied and verified", conflict: "Conflict — no overwrite permitted", incomplete: "Incomplete response: output limit reached", failed: "Failed" },
  { language: "ru", draft: "Черновик отдельной заметки — исходник без изменений · Сгенерировано", prefix: "Предлагаемое действие с исходником:", generated: "Сгенерировано", replace: "Заменить", append: "Добавить в конец", created: "Отдельная заметка создана", applied: "Применено и проверено", conflict: "Конфликт — перезапись запрещена", incomplete: "Ответ неполный: достигнут лимит вывода", failed: "Ошибка" },
] as const;

describe.each(languages)("Studio Review labels in $language", words => {
  it.each(["replace", "append"] as const)("switches the destination of a frozen %s result without changing the recipe action", action => {
    setLanguage(words.language);
    const row = Object.freeze({ action, status: "generated" as const });
    expect(reviewRowLabel(row, "new-note")).toBe(words.draft);
    expect(reviewRowLabel(row, "source")).toBe(`${words.prefix} ${words[action]} · ${words.generated}`);
    expect(reviewRowLabel(row, "new-note")).toBe(words.draft);
    expect(row).toEqual({ action, status: "generated" });
  });

  it.each(["replace", "append"] as const)("shows the observed write outcome, not a draft or the %s action", action => {
    setLanguage(words.language);
    const row = Object.freeze({ action, status: "generated" as const });
    expect(reviewRowLabel(row, "new-note", "created")).toBe(words.created);
    expect(reviewRowLabel(row, "source", "applied")).toBe(words.applied);
    for (const destination of ["source", "new-note"] as const) {
      expect(reviewRowLabel(row, destination, "conflict")).toBe(words.conflict);
      expect(reviewRowLabel(row, destination, "failed")).toBe(words.failed);
    }
  });

  it("keeps incomplete/failed generation visible without claiming an available draft", () => {
    setLanguage(words.language);
    for (const destination of ["new-note", "source"] as const) {
      const incomplete = reviewRowLabel({ action: "replace", status: "incomplete" }, destination, "skipped");
      expect(incomplete).toContain(words.incomplete);
      expect(incomplete).not.toContain(words.generated);
      const failed = reviewRowLabel({ action: "append", status: "failed" }, destination);
      expect(failed).toContain(words.failed);
      expect(failed).not.toContain(words.draft);
    }
  });
});
