import { timingSafeEqual } from 'node:crypto'

export function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

export function bearerSecret(request: Request, headerName: string): string {
  const authorization = request.headers.get('authorization')
  if (authorization !== null && /^Bearer\s+/i.test(authorization)) {
    return authorization.replace(/^Bearer\s+/i, '')
  }

  return request.headers.get(headerName) ?? ''
}
