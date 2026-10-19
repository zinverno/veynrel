import { t as tr } from "../i18n";
import type { ArchiveRecord } from "./archiveJournal";
import type { StructuralArchiveRecord } from "./structuralArchiveJournal";

type Family = "single" | "multi" | "merge" | "group" | "bundle" | "archive" | "structuralArchive" | "emptyAtom";
export interface HistoryPresentation {
  family: Family;
  row: { id: string; damaged: boolean; record?: { id: string; createdAt: number } };
  parent?: { family: "merge" | "group" | "bundle"; record: ArchiveRecord["parent"] | StructuralArchiveRecord["parent"] };
  render(root: HTMLElement, hasArchive: boolean): void;
}
export interface HistoryGroup { parent: HistoryPresentation; archives: HistoryPresentation[]; unverified: boolean }

/** A display relationship only. Service-provided action eligibility remains authoritative. */
export function groupHistory(items: readonly HistoryPresentation[]): HistoryGroup[] {
  const groups = new Map<string, HistoryGroup>(items.map(item => [`${item.family}:${item.row.id}`, { parent: item, archives: [], unverified: !!item.parent }]));
  const attached = new Set<HistoryPresentation>();
  for (const item of items) {
    if (!item.parent || item.row.damaged || !item.row.record) continue;
    const group = groups.get(`${item.parent.family}:${item.parent.record.id}`);
    if (!group || group.parent.row.damaged || !group.parent.row.record ||
      JSON.stringify(group.parent.row.record) !== JSON.stringify(item.parent.record)) continue;
    group.archives.push(item); attached.add(item);
  }
  const time = (g: HistoryGroup) => Math.max(g.parent.row.record?.createdAt ?? 0, ...g.archives.map(a => a.row.record?.createdAt ?? 0));
  return [...groups.values()].filter(g => !attached.has(g.parent)).sort((a, b) => time(b) - time(a));
}

export function renderConsolidationHistory(root: HTMLElement, items: readonly HistoryPresentation[]): void {
  for (const group of groupHistory(items)) {
    const section = root.createEl("section", { cls: "ai-consolidation-history-group", attr: { "data-history-group": `${group.parent.family}:${group.parent.row.id}` } });
    if (group.archives.length) {
      section.createEl("h2", { text: tr("@ux.chain") });
      section.createEl("p", { text: tr("@ux.chainOrder") });
      if (group.archives.length > 1) section.createEl("p", { text: tr("@ux.multipleArchives"), attr: { role: "alert" } });
    }
    if (group.unverified) section.createEl("p", { text: tr("@ux.parentUnverified"), attr: { role: "alert" } });
    group.parent.render(section, group.archives.length > 0);
    if (group.archives.length) {
      section.createEl("p", { text: tr("@ux.archiveAlreadyLinked") });
      const archives = section.createDiv({ cls: "ai-consolidation-archives" });
      for (const item of group.archives) item.render(archives, false);
    }
  }
}
