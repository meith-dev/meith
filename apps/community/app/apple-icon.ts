import { renderBrandMark } from '@/server/brand-mark'

export const dynamic = 'force-dynamic'

export const size = { width: 180, height: 180 }

export const contentType = 'image/png'

export default function AppleIcon(): Promise<Response> {
  return renderBrandMark(size.width)
}
