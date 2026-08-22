export interface DiffLine {
  readonly kind: 'same' | 'added' | 'removed'
  readonly value: string
}

export function diffLines(before: string, after: string): readonly DiffLine[] {
  const left = before.split('\n')
  const right = after.split('\n')
  const lengths = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  )

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        left[i] === right[j]
          ? 1 + lengths[i + 1]![j + 1]!
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!)
    }
  }

  const result: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      result.push({ kind: 'same', value: left[i]! })
      i += 1
      j += 1
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      result.push({ kind: 'removed', value: left[i]! })
      i += 1
    } else {
      result.push({ kind: 'added', value: right[j]! })
      j += 1
    }
  }
  while (i < left.length) {
    result.push({ kind: 'removed', value: left[i]! })
    i += 1
  }
  while (j < right.length) {
    result.push({ kind: 'added', value: right[j]! })
    j += 1
  }
  return result
}
