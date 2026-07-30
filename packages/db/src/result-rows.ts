/**
 * Normalises the row shape returned by `db.execute()`.
 *
 * Drizzle's raw `execute` hands back whatever the underlying driver returns, and
 * they disagree:
 *
 *   - `postgres.js` (what the app runs) returns an array-like of rows;
 *   - `node-postgres`, PGlite and **Neon's serverless driver** return
 *     `{ rows: [...] }`.
 *
 * F03 built the `DbDriver` seam specifically so Neon could slot in later, so
 * code that assumes postgres.js's shape is a portability bug with a delayed
 * fuse. Worse, the usual workaround is `as unknown as Row[]`, which *asserts*
 * the shape rather than checking it — the compiler then cannot warn about the
 * very thing that will break.
 *
 * Use this for any `execute()` whose rows you read. The query builder is
 * unaffected: it already normalises internally.
 */
export function resultRows<T = Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]

  if (
    typeof result === 'object' &&
    result !== null &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows
  }

  /*
   * A statement with no result set (an UPDATE without RETURNING) legitimately
   * yields neither shape. Returning empty is right; throwing would make every
   * write path defensive for no reason.
   */
  return []
}
