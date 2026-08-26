/**
 * Shared by every board boot smoke (scripts/board-workspace-smoke.mts,
 * scripts/board-deploy-kit-smoke.mts, scripts/board-eject-smoke.mts): proving
 * `/` renders is not proof the standalone build actually serves its own
 * assets (docs/development.md, "forum-web build stages .next/static and
 * public/ into the standalone tree"; MEI-86 shipped without either, and every
 * one of these smokes still passed on `<main>` alone). This asserts a real
 * `/_next/static/*` asset referenced from the rendered HTML answers 200, and
 * that `/sw.js` (served from `public/`) does too.
 */
const ASSET_HREF = /(?:href|src)="(\/_next\/static\/[^"]+)"/

export async function assertBoardAssetsServe(baseUrl: string, html: string): Promise<void> {
  const match = ASSET_HREF.exec(html)
  if (match === null) {
    throw new Error(
      `board-smoke: no /_next/static/* asset reference found in the rendered HTML from ${baseUrl}/`,
    )
  }
  const assetUrl = `${baseUrl}${match[1]}`
  const assetResponse = await fetch(assetUrl)
  if (!assetResponse.ok) {
    throw new Error(`board-smoke: ${assetUrl} answered ${assetResponse.status}`)
  }

  const swUrl = `${baseUrl}/sw.js`
  const swResponse = await fetch(swUrl)
  if (!swResponse.ok) {
    throw new Error(`board-smoke: ${swUrl} answered ${swResponse.status}`)
  }
}

/**
 * MEI-131: a board whose theme catalog was never registered still renders
 * `<main>`, still serves every asset, and still answers 200 — it just prints
 * `default.latestThreads.heading` where the heading belongs. Every smoke here
 * passed against exactly that board.
 *
 * The keys are read from the theme's own catalog rather than sniffed out of
 * the HTML by shape, because the shapes overlap: `community.config.ts` and
 * `meith-final.vercel.app` are dotted lowercase runs too, and a gate that
 * fails on the deployment's own hostname would be turned off within a week.
 * Matching the real key set costs a false positive only if a member writes a
 * post whose text is one of these keys exactly.
 *
 * What this detects is a catalog that was never registered, not any single
 * unresolved key: a key that only ever reaches an attribute — `aria-label`,
 * `placeholder`, `title` — is invisible here, so it is the dozens of keys a
 * dropped catalog puts in element text that make the page fail this.
 */
export function unresolvedMessageKeys(html: string, keys: Iterable<string>): string[] {
  const found = new Set<string>()

  for (const key of keys) {
    if (html.includes(`>${key}<`)) found.add(key)
  }

  return [...found].sort()
}

export function assertMessagesResolve(html: string, keys: Iterable<string>): void {
  const unresolved = unresolvedMessageKeys(html, keys)

  if (unresolved.length > 0) {
    throw new Error(
      `the board rendered ${unresolved.length} message key(s) instead of their text, so a catalog is not registered: ${unresolved.slice(0, 8).join(', ')}`,
    )
  }
}
