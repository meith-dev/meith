import { describe, expect, it } from 'vitest'

import { encodeCbor } from './authenticator.fixture'
import { cborBytes, cborMap, decodeCbor, type CborValue } from './cbor'

function roundTrip(value: unknown): CborValue {
  return decodeCbor(encodeCbor(value)).value
}

describe('reading CBOR', () => {
  it('reads small and large unsigned integers', () => {
    for (const value of [0, 1, 23, 24, 255, 256, 65_535, 65_536, 4_294_967_295]) {
      expect(roundTrip(value)).toBe(value)
    }
  })

  it('reads negative integers', () => {
    for (const value of [-1, -24, -25, -257, -65_537]) {
      expect(roundTrip(value)).toBe(value)
    }
  })

  it('reads text, including outside the basic plane', () => {
    expect(roundTrip('hello')).toBe('hello')
    expect(roundTrip('héllo 🎈')).toBe('héllo 🎈')
  })

  it('reads byte strings back byte for byte', () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, index) => index % 256)
    expect([...cborBytes(roundTrip(bytes))]).toEqual([...bytes])
  })

  it('reads nested arrays and maps', () => {
    const value = new Map<unknown, unknown>([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['nested', [1, 'two', Uint8Array.from([3])]],
    ])

    const decoded = cborMap(roundTrip(value))
    expect(decoded.get('fmt')).toBe('none')
    expect(cborMap(decoded.get('attStmt')!).size).toBe(0)
    expect(Array.isArray(decoded.get('nested'))).toBe(true)
  })

  it('keeps integer map keys, which is how a COSE key is written', () => {
    const key = cborMap(
      roundTrip(
        new Map<number, unknown>([
          [1, 2],
          [3, -7],
          [-1, 1],
        ]),
      ),
    )

    expect(key.get(1)).toBe(2)
    expect(key.get(3)).toBe(-7)
    expect(key.get(-1)).toBe(1)
  })

  it('reports how many bytes a value took, so what follows can be found', () => {
    const first = encodeCbor('one')
    const read = decodeCbor(new Uint8Array([...first, ...encodeCbor('two')]))

    expect(read.value).toBe('one')
    expect(read.length).toBe(first.length)
  })

  it('reads the simple values an authenticator sends', () => {
    expect(decodeCbor(Uint8Array.from([0xf4])).value).toBe(false)
    expect(decodeCbor(Uint8Array.from([0xf5])).value).toBe(true)
    expect(decodeCbor(Uint8Array.from([0xf6])).value).toBeNull()
  })

  it('refuses a value that runs off the end rather than inventing bytes', () => {
    expect(() => decodeCbor(Uint8Array.from([0x43, 0x01]))).toThrow()
    expect(() => decodeCbor(new Uint8Array())).toThrow()
  })

  it('refuses shapes it does not implement rather than guessing', () => {
    expect(() => decodeCbor(Uint8Array.from([0xfb, 0, 0, 0, 0, 0, 0, 0, 0]))).toThrow()
    expect(() => cborMap('not a map')).toThrow()
    expect(() => cborBytes('not bytes')).toThrow()
  })
})
