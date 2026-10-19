import { FileSystemAdapter, Platform } from "obsidian";
import type { App } from "obsidian";
type FileHandle = import("node:fs/promises").FileHandle;
type Stats = import("node:fs").Stats;
declare const require: (name: string) => unknown;
import { atomKey, validateAtomizationPath } from "./atomizationPlan";

export type StorageScope = "confirmed-local-unsynchronized" | "unknown" | "network" | "synchronized";
export type ExclusiveFailure = "platform" | "adapter" | "environment" | "filesystem" | "path" | "occupied" | "changed" | "io" | "close";
export class ExclusiveCreateError extends Error {
  constructor(readonly reason: ExclusiveFailure, readonly mayHaveCreated: boolean, readonly code?: string) { super(reason); }
}
type NodeModules = { fs: typeof import("node:fs"); path: typeof import("node:path"); platform: string };
export interface ExclusiveFileIdentity { dev: number; ino: number; size: number; ctimeMs: number; mtimeMs: number; birthtimeMs: number }
export interface ExclusiveCreated { path: string; markdown: string; identity: ExclusiveFileIdentity }
export type DesktopCreationCapability = { available: false; reason: ExclusiveFailure } | {
  available: true; applyReady: false; filesystem: "btrfs";
  /** Primitive only. No plan consent, journal, native metadata receipt or Apply authority. */
  create(path: string, markdown: string): Promise<ExclusiveCreated>;
  verify(created: ExclusiveCreated): Promise<void>;
};
const identity = (s: Stats): ExclusiveFileIdentity => ({ dev: s.dev, ino: s.ino, size: s.size, ctimeMs: s.ctimeMs, mtimeMs: s.mtimeMs, birthtimeMs: s.birthtimeMs });
const sameFile = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino && a.isFile() && b.isFile();
const sameIdentity = (a: ExclusiveFileIdentity, b: ExclusiveFileIdentity) => JSON.stringify(a) === JSON.stringify(b);
const code = (e: unknown) => typeof e === "object" && e !== null && "code" in e && typeof e.code === "string" ? e.code : undefined;

/** Not imported by the plugin entrypoint. The native gate is the only caller of the candidate creator. */
export async function inspectDesktopCreation(app: App, scope: StorageScope = "unknown", load?: () => NodeModules): Promise<DesktopCreationCapability> {
  if (!Platform.isDesktopApp) return { available: false, reason: "platform" };
  if (!(app.vault.adapter instanceof FileSystemAdapter)) return { available: false, reason: "adapter" };
  if (scope !== "confirmed-local-unsynchronized") return { available: false, reason: "environment" };
  // Obsidian's mobile guidance requires runtime loading behind the desktop check.
  let node: NodeModules;
  try {
    if (load) node = load();
    else if (Platform.isDesktop && Platform.isDesktopApp) {
      node = { fs: require("node:fs") as typeof import("node:fs"), path: require("node:path") as typeof import("node:path"), platform: (require("node:os") as typeof import("node:os")).platform() };
    } else return { available: false, reason: "platform" };
  } catch { return { available: false, reason: "platform" }; }
  if (node.platform !== "linux") return { available: false, reason: "platform" };
  const { fs, path: paths } = node, io = fs.promises, adapter = app.vault.adapter;
  const base = paths.resolve(adapter.getBasePath());
  let fsType: number, baseStat: Stats;
  try {
    if (await io.realpath(base) !== base) return { available: false, reason: "path" };
    fsType = (await io.statfs(base)).type;
    baseStat = await io.stat(base);
  } catch { return { available: false, reason: "filesystem" }; }
  // Only the filesystem exercised by this Linux native gate; no inference about sync software.
  if (fsType !== 0x9123683e) return { available: false, reason: "filesystem" };
  const proc = (h: FileHandle) => `/proc/self/fd/${h.fd}`;
  const ensure = (ok: unknown, reason: ExclusiveFailure) => { if (!ok) throw new ExclusiveCreateError(reason, false); };
  const locate = (path: string) => {
    try { validateAtomizationPath(path, app.vault.configDir); } catch { throw new ExclusiveCreateError("path", false); }
    const full = adapter.getFullPath(path);
    ensure(paths.isAbsolute(full) && full === paths.join(base, path) && paths.relative(base, full) === path, "path");
    return { full, parent: paths.dirname(full), name: paths.basename(full) };
  };
  // Every component is opened without following symlinks, relative to the preceding pinned directory.
  const pin = async (parent: string, handles: FileHandle[]) => {
    let current = await io.open("/", fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    handles.push(current); let expected = "";
    for (const part of parent.split("/").filter(Boolean)) {
      current = await io.open(`${proc(current)}/${part}`, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      handles.push(current); expected += `/${part}`;
      ensure(await io.realpath(proc(current)) === expected, "changed");
      if (expected === base) { const stat = await current.stat(); ensure(stat.dev === baseStat.dev && stat.ino === baseStat.ino, "changed"); }
    }
    const stat = await current.stat();
    ensure(stat.dev === baseStat.dev && (await io.statfs(proc(current))).type === fsType, "filesystem");
    return current;
  };
  const parentCurrent = async (parent: FileHandle, expected: string) => {
    ensure(app.vault.adapter === adapter && paths.resolve(adapter.getBasePath()) === base, "changed");
    ensure(await io.realpath(proc(parent)) === expected && await io.realpath(expected) === expected, "changed");
    const a = await parent.stat(), b = await io.lstat(expected), root = await io.lstat(base);
    ensure(a.dev === b.dev && a.ino === b.ino && !b.isSymbolicLink() && root.dev === baseStat.dev && root.ino === baseStat.ino, "changed");
  };
  const collisions = async (parent: FileHandle, name: string, own = false) => {
    const names = await io.readdir(proc(parent));
    ensure(!names.some(n => atomKey(n) === atomKey(name) && (!own || n !== name)), "occupied");
  };
  const verifyAt = async (parent: FileHandle, name: string, expected: ExclusiveCreated, handles: FileHandle[]) => {
    const handle = await io.open(`${proc(parent)}/${name}`, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    handles.push(handle);
    const before = await handle.stat();
    ensure(before.isFile() && before.nlink === 1 && sameIdentity(identity(before), expected.identity), "changed");
    ensure(await handle.readFile("utf8") === expected.markdown, "changed");
    const after = await handle.stat(), named = await io.lstat(`${proc(parent)}/${name}`);
    ensure(sameFile(before, named) && sameIdentity(identity(after), expected.identity) && sameIdentity(identity(named), expected.identity), "changed");
  };
  const run = async (path: string, markdown: string, previous?: ExclusiveCreated): Promise<ExclusiveCreated> => {
    const handles: FileHandle[] = []; let created = false, result: ExclusiveCreated | undefined, failure: unknown;
    try {
      ensure(typeof markdown === "string" && markdown.length > 0 && markdown.length <= 600_000 &&
        new TextDecoder().decode(new TextEncoder().encode(markdown)) === markdown, "path");
      const location = locate(path), parent = await pin(location.parent, handles);
      await parentCurrent(parent, location.parent); await collisions(parent, location.name, !!previous);
      if (previous) result = previous;
      else {
        // O_EXCL is the creation guarantee. This does not use exists(), truncate or a path-based writer.
        const file = await io.open(`${proc(parent)}/${location.name}`, "wx", 0o600);
        handles.push(file); created = true;
        const initial = await file.stat();
        await parentCurrent(parent, location.parent);
        const named = await io.lstat(`${proc(parent)}/${location.name}`);
        ensure(sameFile(initial, named) && sameIdentity(identity(initial), identity(named)) && initial.nlink === 1 && initial.size === 0, "changed");
        await file.writeFile(markdown, "utf8"); await file.sync(); await parent.sync();
        const after = await file.stat();
        ensure(after.size === new TextEncoder().encode(markdown).length && after.nlink === 1, "changed");
        result = { path, markdown, identity: identity(after) };
      }
      await verifyAt(parent, location.name, result, handles);
      await parentCurrent(parent, location.parent); await collisions(parent, location.name, true);
    } catch (e) { failure = e; }
    // A failed write can leave an empty/partial file. Never unlink or retry an ambiguous result.
    for (const handle of handles.reverse()) {
      try { await handle.close(); } catch (e) { failure = new ExclusiveCreateError("close", created, code(e)); }
    }
    if (failure) throw new ExclusiveCreateError(failure instanceof ExclusiveCreateError ? failure.reason : code(failure) === "EEXIST" ? "occupied" : "io", created, code(failure));
    return result!;
  };
  // A pinned directory can itself be moved outside the vault. This primitive is not Apply authorization.
  return { available: true, applyReady: false, filesystem: "btrfs",
    create: (path, markdown) => run(path, markdown), verify: async created => { await run(created.path, created.markdown, created); } };
}
