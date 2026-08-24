/**
 * Version comparison and the "meith" range check.
 *
 * `marketplace/schema.json` documents the range syntax but the generator
 * only checks that it *parses* — it is never evaluated against a real
 * version there (see docs/marketplace.md). This is that evaluation, written
 * for the first time here: comparators `>=`, `<=`, `>`, `<` or `=` (default
 * `=`) against a version of one to three numeric parts, space-separated to
 * mean AND.
 *
 * Precision is handled differently for the two families, which is a
 * deliberate reading rather than something the docs pin down:
 *
 * - `=` **truncates** the board version to the comparator's own precision,
 *   so `=1` means "meith major 1, whatever the minor and patch" and `=1.2`
 *   means "1.2.x". That is what "pin to a major or minor" has to mean.
 * - `>=`, `<=`, `>`, `<` **zero-pad** the comparator to three parts before
 *   comparing the full version against it, so `<1` means "strictly before
 *   1.0.0" and `>1.2` means "newer than 1.2.0" (1.2.5 included) rather than
 *   "1.3.0 or later". That is the ordinary meaning of a version bound.
 */

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

/** -1 if `a` is older than `b`, 0 if equal, 1 if newer. Both must be full semver. */
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

/** Parses a `meith` range string, or null when it does not parse. */
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

/**
 * Whether `version` (major.minor.patch) satisfies every comparator in
 * `range`. An unparseable range or version is never satisfied — an honest
 * "no", not a thrown error, since this runs against untrusted feed data.
 */
export function satisfiesMeithRange(range: string, version: string): boolean {
  const comparators = parseMeithRange(range)
  if (comparators === null) return false

  const parsedVersion = parseSemver(version)
  if (parsedVersion === null) return false

  return comparators.every((comparator) => satisfiesComparator(comparator, parsedVersion))
}
