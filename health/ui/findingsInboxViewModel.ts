import { dateLocale, t } from "../../i18n";
import type { Finding, FindingState, HealthDimension } from "../domain/finding";
import { compareStrings } from "../domain/validation";
import { findingPresentation } from "./findingPresentation";
import { findingEvidencePresentation } from "./findingEvidencePresentation";

export const FINDING_STATES: readonly FindingState[] = ["open", "snoozed", "dismissed", "resolved"];
export const FINDING_DIMENSIONS = ["all", "structure", "connections", "recall", "knowledge"] as const;
export interface FindingsFilter { state: FindingState; dimension: HealthDimension | "all" }
export type FindingsRoute = { page: "findings"; selectedFindingId?: string } & FindingsFilter;
export type VeynrelHealthRoute = { page: "health" } | FindingsRoute;

export function findingsRoute(options: Partial<Omit<FindingsRoute, "page">> = {}): FindingsRoute {
  return { page: "findings", state: "open", dimension: "all", ...options };
}

export const SNOOZE_DAYS = [1, 7, 30] as const;
export type SnoozeDays = typeof SNOOZE_DAYS[number];
/** Fixed elapsed days, computed at the click. Expiry is observed only by reconciliation, never by a UI timer. */
export function snoozeDeadline(days: SnoozeDays, clock: () => number = Date.now): number {
  return clock() + days * 24 * 60 * 60 * 1000;
}

export interface FindingsInboxInput {
  findings: readonly Finding[];
  route: FindingsRoute;
  mutatingFindingId?: string;
  busy?: boolean;
}

/** Derived copies only. Counts are scoped to the dimension, before applying the state filter. */
export function findingsInboxViewModel({ findings, route, mutatingFindingId, busy = false }: FindingsInboxInput) {
  const inDimension = findings.filter((finding) => route.dimension === "all" || finding.dimension === route.dimension);
  const counts: Record<FindingState, number> = { open: 0, snoozed: 0, dismissed: 0, resolved: 0 };
  for (const finding of inDimension) counts[finding.state]++;
  const impact = { attention: 0, review: 1, info: 2 };
  const visible = inDimension.filter((finding) => finding.state === route.state)
    .sort((a, b) => impact[a.impact] - impact[b.impact] || b.lastSeenAt - a.lastSeenAt || compareStrings(a.id, b.id));
  const rows = visible.map((finding) => {
    const { affectedCount } = findingEvidencePresentation(finding);
    return { id: finding.id, ...findingPresentation(finding), dimension: t(`@health.${finding.dimension}`),
      noteSummary: affectedCount === 1 && finding.notePaths.length === 1 ? finding.notePaths[0] : t("@findings.notes", { n: affectedCount }),
      selected: finding.id === route.selectedFindingId };
  });
  const selected = visible.find((finding) => finding.id === route.selectedFindingId);
  const evidence = selected ? findingEvidencePresentation(selected) : undefined;
  return {
    rows, counts,
    stateFilters: FINDING_STATES.map((value) => ({ value, label: t(`@findings.state.${value}`), count: counts[value], selected: route.state === value })),
    dimensionFilters: FINDING_DIMENSIONS.map((value) => ({ value, label: t(value === "all" ? "@findings.all" : `@health.${value}`), selected: route.dimension === value })),
    selected: selected && evidence ? {
      id: selected.id, ...findingPresentation(selected), dimension: t(`@health.${selected.dimension}`), state: t(`@findings.state.${selected.state}`),
      source: selected.source === "local" ? t("@findings.local-check") : undefined,
      notes: [...selected.notePaths], affectedSummary: t("@findings.affected-count", { n: evidence.affectedCount }),
      representativeSummary: evidence.representativeSummary, facts: evidence.facts,
      snoozedUntil: selected.state === "snoozed" && selected.snoozedUntil !== undefined
        ? t("@findings.snoozed-until", { date: new Intl.DateTimeFormat(dateLocale(), { dateStyle: "medium", timeStyle: "short" }).format(selected.snoozedUntil) }) : undefined,
      canDismiss: selected.state === "open", canSnooze: selected.state === "open",
      canReopen: selected.state === "dismissed" || selected.state === "snoozed",
      resolved: selected.state === "resolved", disabled: busy || mutatingFindingId !== undefined,
    } : undefined,
    selectionLeftFilter: route.selectedFindingId !== undefined && !selected,
    selectionResolved: route.state === "open" && route.selectedFindingId !== undefined &&
      findings.some((finding) => finding.id === route.selectedFindingId && finding.state === "resolved"),
    empty: { title: t(`@findings.empty.${route.state}`), description: t("@findings.empty-description") },
  };
}

export type FindingsInboxViewModel = ReturnType<typeof findingsInboxViewModel>;
