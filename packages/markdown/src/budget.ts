/**
 * F36 — the node allowance, shared by the block and inline parsers.
 *
 * One counter for the whole document rather than one per stage, because the
 * thing being bounded is the size of the tree the renderer will walk, and a
 * body can reach a pathological size from either direction: ten thousand list
 * items, or one paragraph holding ten thousand emphasis runs.
 *
 * Running out is **not** an error and not a truncation. The parser stops
 * formatting and the rest of the source is kept as text, so a post that trips
 * this still shows every word its author wrote.
 */
export class NodeBudget {
  private used = 0
  /** Set when the allowance ran out. Surfaced on the document. */
  public exhausted = false

  constructor(private readonly max: number) {}

  /** Claim one node. False means the allowance is gone; stop building. */
  take(): boolean {
    if (this.used >= this.max) {
      this.exhausted = true
      return false
    }
    this.used += 1
    return true
  }

  /** Whether anything is left, without claiming it. */
  get spent(): boolean {
    return this.used >= this.max
  }

  /**
   * Record that formatting stopped.
   *
   * Called by a parser that checked `spent` and gave up rather than by one that
   * asked for a node and was refused. Both are the same event to a reader — a
   * body that stopped being formatted — and `truncated` has to say so either
   * way, or the flag would depend on which loop happened to notice first.
   */
  exhaust(): void {
    this.exhausted = true
  }
}
