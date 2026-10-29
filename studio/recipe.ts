import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";

export const STUDIO_LIMITS = Object.freeze({ files: 20, recipes: 100, manifest: 24_000, input: 24_000, output: 48_000, instructions: 2_000 });
export type StudioErrorCode = "recipe" | "parameters" | "scope" | "size" | "source" | "editor" | "unsaved" | "read-editor" | "settings" | "busy" | "stale" | "storage" | "response" | "provider" | "cancelled" | "used" | "conflict" | "timeout" | "aborted" | "http" | "network" | "capabilities";
export class StudioError extends Error { constructor(readonly code: StudioErrorCode) { super(code); } }
export function ensure(value: unknown, code: StudioErrorCode): asserts value { if (!value) throw new StudioError(code); }
export function object(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(value, k));
}
export const integer = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const controls = (v: string, lines: boolean) => Array.from(v).some(c => {
  const n = c.charCodeAt(0); return n === 127 || n < 32 && !(lines && [9, 10, 13].includes(n));
});
export const text = (v: unknown, max: number, empty = false): v is string => typeof v === "string" && v.length <= max &&
  (empty || !!v.trim()) && !controls(v, true);
export const notePath = (v: unknown): v is string => isCanonicalMarkdownPath(v) && v.length <= 1024 &&
  !v.split("/").some(p => p.startsWith(".")) && !controls(v, false);
export const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
export const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
export function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

export interface RecipeParameters { language: "source" | "en" | "ru"; instructions: string }
export interface Recipe {
  schemaVersion: 1; id: string; version: string; source: "builtin" | "user";
  name: { en: string; ru: string }; description: { en: string; ru: string };
  input: { mode: "per_note" }; parameters: RecipeParameters;
  steps: [{ type: "llm_transform"; prompt: string }];
  output: { format: "markdown"; action: "replace" | "append" };
  limits: { maxInputCharacters: number; maxOutputCharacters: number; maxOutputTokens: number };
  constraints: string[];
}

export function validateParameters(value: unknown): RecipeParameters {
  ensure(object(value, ["language", "instructions"]) && typeof value.language === "string" && ["source", "en", "ru"].includes(value.language) &&
    text(value.instructions, STUDIO_LIMITS.instructions, true), "parameters");
  return { language: value.language as RecipeParameters["language"], instructions: value.instructions };
}
export function validateRecipe(value: unknown): Recipe {
  ensure(object(value, ["schemaVersion", "id", "version", "source", "name", "description", "input", "parameters", "steps", "output", "limits", "constraints"]), "recipe");
  ensure(value.schemaVersion === 1 && (value.source === "builtin" || value.source === "user") &&
    typeof value.id === "string" && new RegExp(`^${String(value.source)}\\.[a-z0-9][a-z0-9.-]{0,79}$`, "u").test(value.id) &&
    typeof value.version === "string" && /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/u.test(value.version), "recipe");
  for (const [key, max] of [["name", 120], ["description", 1200]] as const) {
    const localized = value[key]; ensure(object(localized, ["en", "ru"]) && text(localized.en, max) && text(localized.ru, max), "recipe");
  }
  ensure(object(value.input, ["mode"]) && value.input.mode === "per_note", "recipe");
  validateParameters(value.parameters);
  ensure(Array.isArray(value.steps) && value.steps.length === 1 && object(value.steps[0], ["type", "prompt"]) &&
    value.steps[0].type === "llm_transform" && text(value.steps[0].prompt, 8000), "recipe");
  ensure(object(value.output, ["format", "action"]) && value.output.format === "markdown" && (value.output.action === "replace" || value.output.action === "append"), "recipe");
  ensure(object(value.limits, ["maxInputCharacters", "maxOutputCharacters", "maxOutputTokens"]) &&
    integer(value.limits.maxInputCharacters, 1, STUDIO_LIMITS.input) && integer(value.limits.maxOutputCharacters, 1, STUDIO_LIMITS.output) &&
    integer(value.limits.maxOutputTokens, 256, 8192), "recipe");
  ensure(Array.isArray(value.constraints) && value.constraints.length > 0 && value.constraints.length <= 12 &&
    value.constraints.every(v => text(v, 500)) && JSON.stringify(value).length <= STUDIO_LIMITS.manifest, "recipe");
  return freeze(JSON.parse(JSON.stringify(value)) as Recipe);
}
export function parseRecipe(raw: string): Recipe {
  ensure(raw.length <= STUDIO_LIMITS.manifest, "recipe");
  try { return validateRecipe(JSON.parse(raw)); } catch { throw new StudioError("recipe"); }
}

export function selectPaths(inventory: readonly string[], selection: { paths: readonly string[] } | { folder: string }): readonly string[] {
  let paths: string[];
  if ("paths" in selection) {
    ensure(selection.paths.length <= STUDIO_LIMITS.files && selection.paths.every(p => notePath(p) && inventory.includes(p)), "scope");
    paths = [...new Set(selection.paths)];
  } else {
    const folder = selection.folder;
    ensure(folder === "/" || notePath(`${folder}/placeholder.md`), "scope");
    paths = inventory.filter(p => notePath(p) && (folder === "/" || p.startsWith(`${folder}/`)));
  }
  ensure(paths.length > 0 && paths.length <= STUDIO_LIMITS.files, "scope");
  return Object.freeze(paths.sort());
}
