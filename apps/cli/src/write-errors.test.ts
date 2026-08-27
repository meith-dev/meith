import { describe, expect, it } from 'vitest'

import { isFsPermissionError, translateWriteError } from './write-errors'

function errno(code: string): NodeJS.ErrnoException {
  const error = new Error(`${code}: synthetic`) as NodeJS.ErrnoException
  error.code = code
  return error
}

const FAILURE = {
  command: 'backup',
  path: '/backup/pre-18.tar.gz',
  target: '/backup',
  reference: 'docs/guides/operations/operating.md, "Backup"',
}

describe('isFsPermissionError', () => {
  it('recognises the two codes a bind mount the container cannot write produces', () => {
    expect(isFsPermissionError(errno('EACCES'))).toBe(true)
    expect(isFsPermissionError(errno('EPERM'))).toBe(true)
  })

  it('claims nothing else', () => {
    expect(isFsPermissionError(errno('EEXIST'))).toBe(false)
    expect(isFsPermissionError(errno('ENOENT'))).toBe(false)
    expect(isFsPermissionError(new Error('no code'))).toBe(false)
    expect(isFsPermissionError(undefined)).toBe(false)
  })
})

describe('translateWriteError', () => {
  it('names the command, the path, the directory and the document that shows the invocation', () => {
    let caught: unknown
    try {
      translateWriteError(errno('EACCES'), FAILURE)
    } catch (error) {
      caught = error
    }

    const message = (caught as Error).message
    expect(message).toMatch(/could not write to .*: permission denied/)
    expect(message).toContain('backup could not write to /backup/pre-18.tar.gz')
    expect(message).toContain('needs write access to /backup')
    expect(message).toContain('fixed, non-root user')
    expect(message).toContain('docs/guides/operations/operating.md, "Backup"')
  })

  it('translates EPERM the same way', () => {
    expect(() => translateWriteError(errno('EPERM'), FAILURE)).toThrow(/permission denied/)
  })

  it('rethrows anything else untouched, so a real failure is not disguised', () => {
    const other = errno('EEXIST')
    expect(() => translateWriteError(other, FAILURE)).toThrow(other)
  })
})
