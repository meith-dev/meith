
const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
])

export function isZeroDecimal(currency: string): boolean {
  return ZERO_DECIMAL.has(currency.toLowerCase())
}

export function isCurrencyCode(value: string): boolean {
  return /^[A-Za-z]{3}$/.test(value)
}

export function isValidMinorAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function formatMinor(amountMinor: number, currency: string): string {
  const upper = currency.toUpperCase()
  const amount = isZeroDecimal(currency) ? amountMinor : amountMinor / 100

  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: upper,
      minimumFractionDigits: isZeroDecimal(currency) ? 0 : 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(isZeroDecimal(currency) ? 0 : 2)} ${upper}`
  }
}

export function moneyMatches(
  expected: { readonly amountMinor: number; readonly currency: string },
  actual: { readonly amountMinor: number | null; readonly currency: string | null },
): boolean {
  return (
    actual.amountMinor === expected.amountMinor &&
    (actual.currency ?? '').toLowerCase() === expected.currency.toLowerCase()
  )
}
