import { absolute, isIndexable } from '@/server/syndication'

export const dynamic = 'force-dynamic'

const COMPUTED = ['/search', '/discover', '/online', '/stats']

const PRIVATE = ['/usercp', '/messages', '/notifications', '/subscriptions', '/modcp', '/moderation', '/admin', '/api']

export async function GET(): Promise<Response> {
  const body = (await isIndexable())
    ? [
        'User-agent: *',
        ...[...COMPUTED, ...PRIVATE].map((path) => `Disallow: ${path}`),
        '',
        `Sitemap: ${await absolute('/sitemap.xml')}`,
        '',
      ].join('\n')
    : ['User-agent: *', 'Disallow: /', ''].join('\n')

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  })
}
