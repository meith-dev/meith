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
