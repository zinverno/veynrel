import { vi } from "vitest";
import type { CachedMetadata, TFile } from "obsidian";
import { parseYaml } from "obsidian";
import { groupApplyFixture } from "./groupApplyFixture";
import { bundleApplyFixture } from "./bundleApplyFixture";
import { groupNote } from "./groupFixture";
import { bundleNote } from "./contextBundleFixture";
import { buildGroupPlan } from "../consolidation/groupPlan";
import { buildContextBundlePlan } from "../consolidation/contextBundlePlan";
import { createSafeApplyService } from "../consolidation/obsidianSafeApply";
import { StructuralArchiveJournal } from "../consolidation/structuralArchiveJournal";
import { readArchiveBasisV2 } from "../consolidation/obsidianArchiveV2";
import { archivePartition, archiveReviewParts, buildArchivePlanV2 } from "../consolidation/archivePlanV2";

export async function structuralArchiveFixture(kind: "group" | "bundle" = "group", side: 0 | 1 = 0, crlf = false, level: 1 | 2 | 3 = 3, core?: string) {
  const f = kind === "group" ? groupApplyFixture(side, crlf, level) : bundleApplyFixture(core, side, crlf);
  f.app.metadataCache.resolvedLinks = {};
  const parse = (file: TFile, content: string) => {
    const prefix = /^---\r?\n[\s\S]*?\r?\n---\r?\n/u.exec(content)?.[0] ?? "";
    const body = content.slice(prefix.length), cache = (kind === "group" ? groupNote(file.path, body) : bundleNote(file.path, body)).cache!;
    const visit = (v: unknown): void => {
      if (Array.isArray(v)) { v.forEach(visit); return; }
      if (!v || typeof v !== "object") return;
      const obj = v as Record<string, unknown>;
      if (typeof obj.offset === "number") {
        obj.offset += prefix.length; obj.line = content.slice(0, obj.offset).split("\n").length - 1;
        obj.col = (obj.offset) - content.lastIndexOf("\n", (obj.offset) - 1) - 1;
      } else Object.values(obj).forEach(visit);
    };
    // Independent JSON objects avoid the fixture's shared heading/section position references.
    const result = JSON.parse(JSON.stringify(cache)) as CachedMetadata; visit(result);
    for (const item of result.listItems ?? []) item.parent -= prefix.split("\n").length - 1;
    f.app.metadataCache.resolvedLinks[file.path] = {};
    if (prefix) {
      const newline = crlf ? 2 : 1, end = prefix.length - newline;
      result.frontmatter = parseYaml(prefix.slice(3 + newline, -3 - newline)) as CachedMetadata["frontmatter"];
      result.frontmatterPosition = { start: { offset: 0, line: 0, col: 0 }, end: { offset: end, line: 3, col: 3 } };
      result.frontmatterLinks = [{ key: "veynrel_canonical", original: `[[${f.pair[side].path.slice(0, -3)}]]`, link: f.pair[side].path.slice(0, -3) }];
      result.sections!.unshift({ type: "yaml", position: result.frontmatterPosition });
      f.app.metadataCache.resolvedLinks[file.path][f.pair[side].path] = 1;
    }
    return result;
  };
  for (const n of f.pair) { n.cache = parse(n.file, n.content); f.caches.set(n.file, n.cache); }
  f.vault.process.mockImplementation(async (file, cb) => {
    const content = cb(f.contents.get(file.path)!); f.contents.set(file.path, content); file.stat.mtime++; file.stat.size = new TextEncoder().encode(content).length;
    f.caches.set(file, parse(file, content)); return content;
  });
  const incoming: import("../consolidation/mergePlan").MergeIncoming = [{ items: [], total: 0 }, { items: [], total: 0 }];
  const restart = () => createSafeApplyService(f.app, "ai-knowledge-hub"), service = restart();
  let parentId: string;
  if ("group" in f) {
    const p = buildGroupPlan(f.analysis, f.pair, f.choice, f.read.linktexts, incoming);
    const r = await service.group!.review(p, f.analysis, () => true); parentId = r.id; await service.group!.execute(r);
  } else {
    const p = buildContextBundlePlan(f.analysis, f.pair, f.choice, f.read.linktexts, incoming);
    const r = await service.bundle!.review(p, f.analysis, () => true); parentId = r.id; await service.bundle!.execute(r);
  }
  const operation = kind === "group" ? "copy_context_group" : "context_bundle_copy";
  const input = await readArchiveBasisV2(f.app, service, operation, parentId, () => true);
  const plan = buildArchivePlanV2(input, { status: "archived", limitationsReviewed: true, unknownDependenciesAccepted: true,
    dispositions: archiveReviewParts(archivePartition(input.record, input.notes[1])).map(p => ({ range: p.range, disposition: "retained" })) });
  const journal = new StructuralArchiveJournal(f.adapter as never, f.vault.configDir, "ai-knowledge-hub");
  vi.mocked(f.vault.process).mockClear();
  return { ...f, service, restart, parentId, input, archivePlan: plan, structuralJournal: journal, archive: service.structuralArchive!,
    parent: service[kind]!, parse, original: [f.pair[side].content, f.pair[1 - side].content] };
}
