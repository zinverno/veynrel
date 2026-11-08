import { isRecord } from "../../health/domain/validation";
import { isRecallLanguage, isStudyTag, studyTags } from "../domain/topics";

export function vocabularySettings(content: string, parseYaml?: (yaml: string) => unknown) {
  const yaml = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/u.exec(content)?.[1];
  if (!yaml?.includes("veynrel-recall")) return undefined;
  if (!parseYaml) throw new Error("Vocabulary properties decoder unavailable.");
  const data: unknown = parseYaml(yaml);
  if (!isRecord(data)) throw new Error("Invalid vocabulary properties.");
  if (data["veynrel-recall"] !== "vocabulary") return undefined;
  const language = data["recall-language"], translationLanguage = data["recall-translation-language"];
  const direction = data["recall-direction"] ?? "forward";
  const tags = typeof data.tags === "string" ? data.tags.split(/[ ,]+/u) : data.tags ?? [];
  if (!isRecallLanguage(language) || !isRecallLanguage(translationLanguage) ||
      (typeof direction !== "string" || !["forward", "reverse", "both"].includes(direction)) || !Array.isArray(tags) || !tags.every(t => typeof t === "string")) {
    throw new Error("Invalid vocabulary properties.");
  }
  const topics = studyTags(tags.map((t: string) => t.replace(/^#/u, "")).filter(isStudyTag));
  if (topics.length === 0 || topics.length > 20) throw new Error("A vocabulary needs a study tag.");
  return { language, translationLanguage, direction: direction as "forward" | "reverse" | "both", studyTags: topics };
}
