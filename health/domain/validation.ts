/** Explicit bounds keep evidence useful for explanation without becoming note storage. */
export const MAX_EVIDENCE_SNIPPET = 500;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function isArrayOf<T>(value: unknown, validate: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && Array.from(value).every(validate);
}

export function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !value.includes("\0");
}

export function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value);
}

export function isFingerprint(value: unknown): value is string {
  return isText(value, 32768) && value === value.trim() &&
    !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}

/** Epoch milliseconds: representable by Date, non-negative, with no NaN/Infinity/fractions. */
export function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
}

/** Reject rather than repair. Preserve case and Unicode; never resolve or read this path. */
export function isVaultPath(value: unknown): value is string {
  return isText(value, 4096) && value === value.trim() && !/[\\:]/u.test(value) &&
    !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
    value.split("/").every((part) => part !== "" && part !== "." && part !== ".." && part === part.trim() && !part.endsWith("."));
}

export function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.some((choice) => choice === value);
}

export function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
