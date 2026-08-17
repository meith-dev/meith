import { describe, expect, it } from 'vitest'

import { MEMBER_PATH, THREAD_PATH, countablePath } from './page-path'

describe('countablePath', () => {
  it('keeps the board index', () => {
    expect(countablePath('/')).toBe('/')
    expect(countablePath('/?page=2')).toBe('/')
  })

  it('keeps a forum by its id and drops the slug', () => {
    expect(countablePath('/12-introductions')).toBe('/12')
    expect(countablePath('/12')).toBe('/12')
  })

  it('buckets every thread and every member together', () => {
    expect(countablePath('/thread/91-why-meitheal')).toBe(THREAD_PATH)
    expect(countablePath('/thread/91-why-meitheal?page=3')).toBe(THREAD_PATH)
    expect(countablePath('/member/44-ann')).toBe(MEMBER_PATH)
  })

  it('keeps a plugin at its key and forgets the rest of the path', () => {
    expect(countablePath('/plugins/dues/checkout/step-2')).toBe('/plugins/dues')
  })

  it('counts nothing outside a rendered board page', () => {
    for (const path of [
      '/api/v1/threads',
      '/admin/settings',
      '/auth/resume',
      '/attachment/9',
      '/avatar/3',
      '/sitemap/1.xml',
    ]) {
      expect(countablePath(path), path).toBeNull()
    }
  })

  it('leaves a member’s own pages out of it', () => {
    for (const path of [
      '/usercp/security',
      '/messages/17',
      '/notifications',
      '/subscriptions',
      '/moderation/reports',
      '/modcp',
      '/report/9',
      '/unsubscribe/abc',
    ]) {
      expect(countablePath(path), path).toBeNull()
    }
  })

  it('refuses anything that is not a plain local path', () => {
    for (const path of ['', 'search', 'https://example.com/x', '//evil.com', '/../etc']) {
      expect(countablePath(path), path).toBeNull()
    }
  })

  it('drops the query, the fragment and a trailing slash', () => {
    expect(countablePath('/search?q=hello#results')).toBe('/search')
    expect(countablePath('/search/')).toBe('/search')
  })

  it('replaces a numeric segment it does not recognise', () => {
    expect(countablePath('/discover/tag/17')).toBe('/discover/tag/:id')
  })

  it('keeps at most three segments', () => {
    expect(countablePath('/a/b/c/d/e')).toBe('/a/b/c')
  })

  it('refuses a segment that is not a plain identifier', () => {
    expect(countablePath('/search/<script>')).toBeNull()
  })
})
