import { isCancellation, LocalAnalysisCancelledError, throwIfAborted, withAbort } from "../analyzers/local/cancellation";
import { sameLocalVaultRevision } from "../analyzers/local/localVaultRevision";
import type { LocalVaultFreshnessProbe, LocalVaultRevision } from "../analyzers/local/localVaultRevision";

export class LocalHealthStaleScanError extends Error {
  constructor() { super("The vault changed during local Health analysis."); this.name = "LocalHealthStaleScanError"; }
}

export class LocalHealthFreshnessUnavailableError extends Error {
  constructor() { super("Local vault freshness could not be verified."); this.name = "LocalHealthFreshnessUnavailableError"; }
}

export async function verifyLocalScanFreshness(analyzed: LocalVaultRevision, probe: LocalVaultFreshnessProbe, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  let current: LocalVaultRevision;
  try {
    if (!analyzed.complete) throw new LocalHealthFreshnessUnavailableError();
    current = await withAbort(probe.captureRevision(signal), signal);
    throwIfAborted(signal);
    if (!current.complete) throw new LocalHealthFreshnessUnavailableError();
  } catch (error) {
    throwIfAborted(signal);
    if (isCancellation(error)) throw new LocalAnalysisCancelledError();
    throw new LocalHealthFreshnessUnavailableError();
  }
  if (!sameLocalVaultRevision(analyzed, current)) throw new LocalHealthStaleScanError();
}
