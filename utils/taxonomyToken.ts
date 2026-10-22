export function taxonomyToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 &&
    !/[\s#]/u.test(value) && !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
    value.split("/").every(part => part.length > 0);
}
