import { renderBrandSocial } from '@/server/brand-mark'

export const dynamic = 'force-dynamic'

export const size = { width: 1200, height: 630 }

export const contentType = 'image/png'

export default function OpengraphImage(): Promise<Response> {
  return renderBrandSocial()
}
