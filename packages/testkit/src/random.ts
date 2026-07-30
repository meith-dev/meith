/**
 * Deterministic pseudo-randomness for the seeder (F11).
 *
 * `Math.random()` would make every seeded board different, which defeats the
 * point: a query-budget or performance assertion that fails only sometimes is
 * worse than no assertion, because the first three green runs teach everyone to
 * re-run it. A fixed seed means "50 forums, 100k threads" is the *same* 50
 * forums and the same 100k threads on every machine and every CI run.
 *
 * mulberry32 — small, fast, and good enough for spreading rows across forums
 * and dates. It is not cryptographic and must never be used for tokens; the
 * real thing lives in `@forum/accounts/crypto`.
 */
export interface Random {
  /** Float in [0, 1). */
  next(): number
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number
  /** An element of `items`. Throws on an empty array rather than returning undefined. */
  pick<T>(items: readonly T[]): T
  /** True with probability `p`. */
  chance(p: number): boolean
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (min: number, max: number): number => {
    if (max < min) throw new Error(`int(${min}, ${max}): max is below min`)
    return min + Math.floor(next() * (max - min + 1))
  }

  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('pick() on an empty array')
      return items[int(0, items.length - 1)] as T
    },
    chance: (p: number) => next() < p,
  }
}

const WORDS = [
  'server',
  'thread',
  'reply',
  'notice',
  'welcome',
  'guide',
  'question',
  'bug',
  'release',
  'draft',
  'archive',
  'general',
  'support',
  'feedback',
  'offtopic',
  'rules',
]

/** A short readable phrase — titles that look like a forum, not like uuids. */
export function words(random: Random, count: number): string {
  return Array.from({ length: count }, () => random.pick(WORDS)).join(' ')
}

/**
 * Body text of roughly `paragraphs` paragraphs.
 *
 * Realistic length matters: a seeded board of one-word posts hides the cost of
 * fetching and rendering real ones, and TOAST behaviour differs once a value
 * exceeds ~2kB.
 */
export function paragraphs(random: Random, count: number): string {
  return Array.from({ length: count }, () => words(random, random.int(20, 60))).join('\n\n')
}
