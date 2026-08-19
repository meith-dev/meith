import { buildFaviconSvg, loadBrandInfo } from '@/server/brand-assets'

export const dynamic = 'force-dynamic'

export const contentType = 'image/svg+xml'

export default async function Icon(): Promise<Response> {
  const info = await loadBrandInfo()

  return new Response(buildFaviconSvg(info), {
    headers: { 'Content-Type': 'image/svg+xml' },
  })
}
