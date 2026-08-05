/**
 * Two number formats, written out rather than delegated.
 *
 * `toLocaleString()` asks the runtime what locale it is in, and the runtime is
 * Node during the build and a browser during hydration. When they disagree —
 * `18,332` against `18 332` — React replaces the node and logs a hydration
 * error, for a figure that was never meant to be localised in the first place.
 * These pages are written in English and their numbers are grouped in English.
 */

/** `18332` → `18,332`. */
export function group(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/**
 * `2343847` → `2.3M`. For a figure being *quoted* rather than tabulated: two
 * significant places is what a reader carries away, and the exact count is one
 * click into the reference that produced it.
 */
export function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 10_000) return `${Math.round(value / 1000)}k`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return group(value)
}
