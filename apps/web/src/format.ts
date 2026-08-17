export function group(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 10_000) return `${Math.round(value / 1000)}k`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return group(value)
}
