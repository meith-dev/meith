import { boardFeed } from '@/server/feed-routes'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return boardFeed('rss', '/feed.xml', request)
}
