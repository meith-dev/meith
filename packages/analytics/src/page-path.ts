export const MAX_PATH_LENGTH = 80

export const THREAD_PATH = '/thread/:id'

export const MEMBER_PATH = '/member/:id'

const UNCOUNTED_PREFIXES = [
  '/admin',
  '/api',
  '/attachment',
  '/auth',
  '/avatar',
  '/demo',
  '/install',
  '/jump',
  '/logo',
  '/messages',
  '/modcp',
  '/moderation',
  '/notifications',
  '/redirect',
  '/report',
  '/sitemap',
  '/subscriptions',
  '/unsubscribe',
  '/usercp',
] as const

const FORUM = /^\/(\d+)(?:-[^/]*)?$/

const THREAD = /^\/thread\/\d+(?:-[^/]*)?(\/.*)?$/

const MEMBER = /^\/member\/\d+(?:-[^/]*)?$/

const PLUGIN = /^\/plugins\/([a-z][a-z0-9-]{0,40})(?:\/.*)?$/

const NUMERIC = /^\d+$/

const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,40}$/

function trimmed(raw: string): string | null {
  const withoutHash = raw.split('#')[0] ?? ''
  const withoutQuery = withoutHash.split('?')[0] ?? ''

  if (!withoutQuery.startsWith('/')) return null
  if (withoutQuery.includes('//') || withoutQuery.includes('..')) return null
  if (withoutQuery === '/') return '/'

  const clean = withoutQuery.replace(/\/+$/, '')
  return clean === '' ? '/' : clean
}

export function countablePath(raw: string): string | null {
  const path = trimmed(raw)
  if (path === null) return null

  if (path === '/') return '/'

  const first = `/${path.split('/')[1] ?? ''}`
  if (UNCOUNTED_PREFIXES.includes(first as (typeof UNCOUNTED_PREFIXES)[number])) {
    return null
  }

  if (FORUM.test(path)) return `/${FORUM.exec(path)?.[1] ?? ''}`
  if (THREAD.test(path)) return THREAD_PATH
  if (MEMBER.test(path)) return MEMBER_PATH

  const plugin = PLUGIN.exec(path)
  if (plugin !== null) return `/plugins/${plugin[1]}`

  const segments = path.slice(1).split('/')
  const kept: string[] = []

  for (const segment of segments.slice(0, 3)) {
    if (NUMERIC.test(segment)) {
      kept.push(':id')
      continue
    }
    if (!SAFE_SEGMENT.test(segment)) return null
    kept.push(segment)
  }

  const bucketed = `/${kept.join('/')}`
  return bucketed.length > MAX_PATH_LENGTH ? null : bucketed
}
