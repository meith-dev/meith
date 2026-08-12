import { boardFeed } from '@/server/feed-routes'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  return boardFeed('atom', '/atom.xml')
}
