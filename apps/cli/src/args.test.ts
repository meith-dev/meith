import { describe, expect, it } from 'vitest'

import { integer, optional, parseFlags, required } from './args'

describe('parseFlags', () => {
  it('reads --key value and --key=value alike', () => {
    const { flags } = parseFlags(['--title', 'General', '--slug=general'])
    expect(flags.get('title')).toBe('General')
    expect(flags.get('slug')).toBe('general')
  })

  it('keeps bare words positional', () => {
    const { positional } = parseFlags(['board.name', 'My Forum'])
    expect(positional).toEqual(['board.name', 'My Forum'])
  })

  it('treats a flag followed by another flag as a boolean', () => {
    const { flags } = parseFlags(['--force', '--verbose'])
    expect(flags.get('force')).toBe('true')
    expect(flags.get('verbose')).toBe('true')
  })

  it('treats a trailing flag as a boolean', () => {
    expect(parseFlags(['--dry-run']).flags.get('dry-run')).toBe('true')
  })

  it('keeps a value containing = intact after the first one', () => {
    expect(parseFlags(['--url=a=b=c']).flags.get('url')).toBe('a=b=c')
  })

  it('allows a negative-looking value to stay a value', () => {
    const { flags } = parseFlags(['--parent', '12'])
    expect(flags.get('parent')).toBe('12')
  })
})

describe('required / optional', () => {
  it('names the missing flag rather than throwing a stack', () => {
    const { flags } = parseFlags([])
    expect(() => required(flags, 'title')).toThrow(/--title/)
  })

  it('treats whitespace as absent', () => {
    const { flags } = parseFlags(['--title', '   '])
    expect(() => required(flags, 'title')).toThrow()
    expect(optional(flags, 'title')).toBeUndefined()
  })
})

describe('integer', () => {
  it('parses a whole number', () => {
    expect(integer(parseFlags(['--parent', '12']).flags, 'parent')).toBe(12)
  })

  it('is undefined when absent, so a caller can default it', () => {
    expect(integer(parseFlags([]).flags, 'parent')).toBeUndefined()
  })

  it('rejects a non-integer with the value in the message', () => {
    const { flags } = parseFlags(['--parent', 'abc'])
    expect(() => integer(flags, 'parent')).toThrow(/"abc"/)
  })

  it('rejects a decimal, which would silently truncate an id', () => {
    const { flags } = parseFlags(['--parent', '1.5'])
    expect(() => integer(flags, 'parent')).toThrow()
  })
})
