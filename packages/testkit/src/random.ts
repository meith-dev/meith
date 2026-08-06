export interface Random {
  next(): number
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
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

export function words(random: Random, count: number): string {
  return Array.from({ length: count }, () => random.pick(WORDS)).join(' ')
}

export function paragraphs(random: Random, count: number): string {
  return Array.from({ length: count }, () => words(random, random.int(20, 60))).join('\n\n')
}
