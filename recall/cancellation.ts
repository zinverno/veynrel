export function recallCancelled(): Error {
  const error = new Error("Recall inventory was cancelled.");
  error.name = "AbortError";
  return error;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw recallCancelled();
}

/** Vault.read is not abortable; detach the waiter and stop scheduling new reads. */
export async function withRecallAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort = (): void => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(recallCancelled());
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try { return await Promise.race([work, cancelled]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

export async function recallCheckpoint(signal: AbortSignal | undefined, processed: number): Promise<void> {
  throwIfAborted(signal);
  if (processed % 256 === 0) {
    const schedule = typeof window === "undefined" ? setTimeout : window.setTimeout.bind(window);
    await new Promise<void>((resolve) => schedule(resolve, 0));
  }
  throwIfAborted(signal);
}
