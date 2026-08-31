import {
  buildFaviconSvg,
  faviconDataUri,
  loadBrandInfo,
  loadFaviconAsset,
} from '@/server/brand-assets'

export const dynamic = 'force-dynamic'

export const contentType = 'image/svg+xml'

export default async function Icon(): Promise<Response> {
  const asset = await loadFaviconAsset()

  if (asset !== null && asset.type === 'image/svg+xml') {
    return new Response(asset.bytes as unknown as BodyInit, {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }

  const info = await loadBrandInfo()
  const embedded = asset === null ? null : faviconDataUri(asset)

  return new Response(buildFaviconSvg(info, embedded), {
    headers: { 'Content-Type': 'image/svg+xml' },
  })
}
