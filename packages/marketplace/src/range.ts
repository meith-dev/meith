export type Semver = readonly [number, number, number]

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/

export function parseSemver(value: string): Semver | null {
  const match = SEMVER_PATTERN.exec(value.trim())
  if (match === null) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareParts(a: readonly number[], b: readonly number[]): number {
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return Math.sign(diff)
  }
  return 0
}

export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a)
  const right = parseSemver(b)
  if (left === null || right === null) {
    throw new Error(`marketplace: "${left === null ? a : b}" is not a major.minor.patch version`)
  }
  return compareParts(left, right)
}

type ComparatorOp = '>=' | '<=' | '>' | '<' | '='

interface Comparator {
  readonly op: ComparatorOp
  readonly parts: readonly number[]
}

const COMPARATOR_TOKEN = /^(>=|<=|>|<|=)?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/

function parseComparator(token: string): Comparator | null {
  const match = COMPARATOR_TOKEN.exec(token)
  if (match === null) return null

  const op = (match[1] ?? '=') as ComparatorOp
  const parts = [match[2], match[3], match[4]]
    .filter((part): part is string => part !== undefined)
    .map(Number)
  return { op, parts }
}

export function parseMeithRange(range: string): readonly Comparator[] | null {
  const trimmed = range.trim()
  if (trimmed === '') return null

  const comparators = trimmed.split(/\s+/).map(parseComparator)
  return comparators.every((c): c is Comparator => c !== null) ? comparators : null
}

function satisfiesComparator(comparator: Comparator, version: Semver): boolean {
  if (comparator.op === '=') {
    return compareParts(version.slice(0, comparator.parts.length), comparator.parts) === 0
  }

  const padded: Semver = [
    comparator.parts[0] ?? 0,
    comparator.parts[1] ?? 0,
    comparator.parts[2] ?? 0,
  ]
  const cmp = compareParts(version, padded)
  switch (comparator.op) {
    case '>=':
      return cmp >= 0
    case '<=':
      return cmp <= 0
    case '>':
      return cmp > 0
    case '<':
      return cmp < 0
  }
}

export function satisfiesMeithRange(range: string, version: string): boolean {
  const comparators = parseMeithRange(range)
  if (comparators === null) return false

  const parsedVersion = parseSemver(version)
  if (parsedVersion === null) return false

  return comparators.every((comparator) => satisfiesComparator(comparator, parsedVersion))
}
