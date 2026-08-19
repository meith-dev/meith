import { renderBrandMark } from '@/server/brand-mark'

export const dynamic = 'force-dynamic'

export function GET(): Promise<Response> {
  return renderBrandMark(512)
}
