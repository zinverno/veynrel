import type { HealthAnalyzer } from "../types";
import type { LocalAnalysisContext } from "./types";
import { brokenLinksAnalyzer } from "./brokenLinksAnalyzer";
import { duplicateTitlesAnalyzer } from "./duplicateTitlesAnalyzer";
import { exactDuplicatesAnalyzer } from "./exactDuplicatesAnalyzer";
import { graphComponentsAnalyzer } from "./graphComponentsAnalyzer";
import { noIncomingLinksAnalyzer } from "./noIncomingLinksAnalyzer";
import { noOutgoingLinksAnalyzer } from "./noOutgoingLinksAnalyzer";
import { noteShapeAnalyzer } from "./noteShapeAnalyzer";
import { orphanAnalyzer } from "./orphanAnalyzer";

/** Stable, versioned compatibility identifiers; intentionally code-unit ordered. */
export const LOCAL_HEALTH_ANALYZERS: readonly HealthAnalyzer<LocalAnalysisContext>[] = Object.freeze([
  brokenLinksAnalyzer, duplicateTitlesAnalyzer, exactDuplicatesAnalyzer, graphComponentsAnalyzer,
  noIncomingLinksAnalyzer, noOutgoingLinksAnalyzer, noteShapeAnalyzer, orphanAnalyzer,
].map((analyzer) => Object.freeze(analyzer)));
