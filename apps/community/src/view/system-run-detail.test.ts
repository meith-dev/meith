import { describe, expect, it } from 'vitest'

import { systemRunDetail } from './system-run-detail'

describe('system run details', () => {
  it('keeps zero counts and boolean results', () => {
    expect(systemRunDetail('{"processed":0,"ok":true}')).toEqual([
      { path: ['processed'], value: 0 },
      { path: ['ok'], value: true },
    ])
  })

  it('turns nested plugin results into fields in their original order', () => {
    expect(systemRunDetail('{"delivery":{"failed":2},"files":["one","two"]}')).toEqual([
      { path: ['delivery', 'failed'], value: 2 },
      { path: ['files', '1'], value: 'one' },
      { path: ['files', '2'], value: 'two' },
    ])
  })

  it('preserves text and malformed legacy details without throwing', () => {
    for (const detail of ['Skipped while disabled', '{incomplete']) {
      expect(systemRunDetail(detail)).toEqual([{ path: [], value: detail }])
    }
    expect(systemRunDetail('"Skipped"')).toEqual([{ path: [], value: 'Skipped' }])
  })

  it('handles absent details and empty structured results', () => {
    expect(systemRunDetail(null)).toEqual([])
    expect(systemRunDetail('  ')).toEqual([])
    for (const detail of ['null', '{}', '[]']) {
      expect(systemRunDetail(detail)).toEqual([{ path: [], value: null }])
    }
  })
})
