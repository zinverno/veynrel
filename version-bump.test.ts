import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it.each([
  { args: [], version: "2.4.0", status: 0, published: "2.3.1" },
  { args: ["--release"], version: "2.4.0", status: 0, published: "2.4.0" },
  { args: ["--release"], version: "2.4.0-beta.1", status: 1, published: "2.3.1" },
  { args: ["--release"], version: undefined, status: 1, published: "2.3.1" },
])("version hook: $args / $version -> public $published", ({ args, version, status, published }) => {
  const cwd = mkdtempSync(join(tmpdir(), "veynrel-version-test-"));
  const manifest = { id: "ai-knowledge-hub", version: "2.3.1", minAppVersion: "1.8.7" };
  const versions = { "2.3.1": "1.8.7" };
  try {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ version }));
    writeFileSync(join(cwd, "manifest.json"), JSON.stringify(manifest));
    writeFileSync(join(cwd, "versions.json"), JSON.stringify(versions));
    const before = ["manifest.json", "versions.json"].map(name => readFileSync(join(cwd, name), "utf8"));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./version-bump.mjs", import.meta.url)), ...args], {
      cwd, encoding: "utf8", env: { ...process.env, npm_package_version: version },
    });
    expect(result.status, result.stderr).toBe(status);
    expect(JSON.parse(readFileSync(join(cwd, "manifest.json"), "utf8"))).toEqual({ ...manifest, version: published });
    expect(JSON.parse(readFileSync(join(cwd, "versions.json"), "utf8"))).toEqual({ ...versions, [published]: "1.8.7" });
    if (published === "2.3.1") {
      expect(["manifest.json", "versions.json"].map(name => readFileSync(join(cwd, name), "utf8"))).toEqual(before);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
