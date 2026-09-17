export class LocalAnalysisCancelledError extends Error {
  constructor() {
    super("Local Health analysis was cancelled.");
    this.name = "AbortError";
  }
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new LocalAnalysisCancelledError();
}

export function isCancellation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

/** Vault.read cannot be interrupted. Stop awaiting it; workers schedule no further reads. */
export async function withAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort = (): void => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new LocalAnalysisCancelledError());
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try { return await Promise.race([work, cancelled]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

/** Yield periodically so a real user abort can run during CPU-bound traversals. */
export async function checkpoint(signal: AbortSignal, processed: number): Promise<void> {
  throwIfAborted(signal);
  if (processed % 256 === 0) {
    const schedule = typeof window === "undefined" ? setTimeout : window.setTimeout.bind(window);
    await new Promise<void>((resolve) => schedule(resolve, 0));
  }
  throwIfAborted(signal);
}
