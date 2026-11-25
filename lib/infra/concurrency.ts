export interface ConcurrencyResult<R> {
  results: Array<PromiseSettledResult<R>>;
  abortedByDeadline: boolean;
}

/**
 * Executes `fn` across `items` with a bounded worker pool (`limit`) and optional
 * deadline guard (`deadlineMs`) so Vercel serverless functions never overrun timeout.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  opts?: { deadlineMs?: number },
): Promise<ConcurrencyResult<R>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  const poolSize = Math.max(1, Math.min(limit, items.length || 1));
  let cursor = 0;
  let abortedByDeadline = false;

  async function worker() {
    while (true) {
      if (opts?.deadlineMs && Date.now() >= opts.deadlineMs) {
        abortedByDeadline = true;
        return;
      }
      const idx = cursor++;
      if (idx >= items.length) return;
      try {
        const value = await fn(items[idx], idx);
        results[idx] = { status: 'fulfilled', value };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return {
    results: results.filter((r): r is PromiseSettledResult<R> => r !== undefined),
    abortedByDeadline,
  };
}
