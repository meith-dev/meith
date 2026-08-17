import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addedNotice,
  announceMultiquote,
  clearMultiquote,
  multiquoteIds,
  multiquoteState,
  selectionLabel,
  serverMultiquoteState,
  subscribeMultiquote,
  takeMultiquote,
  toggleMultiquote,
} from './multiquote'

const KEY = 'multiquote'

function fakeStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => void entries.delete(key),
    setItem: (key: string, value: string) => void entries.set(key, value),
  }
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', fakeStorage())
  clearMultiquote()
})

describe('the selection', () => {
  it('holds a post the first time and drops it the second', () => {
    toggleMultiquote(41)
    expect(multiquoteIds()).toEqual([41])

    toggleMultiquote(41)
    expect(multiquoteIds()).toEqual([])
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('keeps the order posts were selected in', () => {
    toggleMultiquote(7)
    toggleMultiquote(3)
    toggleMultiquote(11)

    expect(multiquoteIds()).toEqual([7, 3, 11])
    expect(sessionStorage.getItem(KEY)).toBe('[7,3,11]')
  })

  it('survives a reload, because the ids are the stored state', () => {
    sessionStorage.setItem(KEY, '[5,9]')

    expect(multiquoteIds()).toEqual([5, 9])
  })

  it('returns the same snapshot object while nothing changes', () => {
    toggleMultiquote(4)

    expect(multiquoteState()).toBe(multiquoteState())
  })

  it('ignores a stored value that is not a list of post ids', () => {
    sessionStorage.setItem(KEY, '{"nope":true}')
    expect(multiquoteIds()).toEqual([])

    sessionStorage.setItem(KEY, 'not json at all')
    expect(multiquoteIds()).toEqual([])

    sessionStorage.setItem(KEY, '[0,-3,"four",null,12,12]')
    expect(multiquoteIds()).toEqual([12])
  })

  it('is empty on the server, where there is no session storage', () => {
    expect(serverMultiquoteState().ids).toEqual([])
  })

  it('is held in memory for a browser that refuses storage at all', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('storage is disabled')
      },
      setItem: () => {
        throw new Error('storage is disabled')
      },
      removeItem: () => {
        throw new Error('storage is disabled')
      },
    })

    toggleMultiquote(6)
    expect(multiquoteIds()).toEqual([6])
    expect(multiquoteState().notice).toBe('Added to multi-quote — 1 post selected.')

    toggleMultiquote(6)
    expect(multiquoteIds()).toEqual([])
  })
})

describe('subscribers', () => {
  it('hear about every change', () => {
    const heard = vi.fn()
    const stop = subscribeMultiquote(heard)

    toggleMultiquote(1)
    toggleMultiquote(1)
    clearMultiquote()
    announceMultiquote('anything')
    expect(heard).toHaveBeenCalledTimes(4)

    stop()
    toggleMultiquote(2)
    expect(heard).toHaveBeenCalledTimes(4)
  })
})

describe('what is announced', () => {
  it('names the change and the running count', () => {
    toggleMultiquote(1)
    expect(multiquoteState().notice).toBe('Added to multi-quote — 1 post selected.')

    toggleMultiquote(2)
    expect(multiquoteState().notice).toBe('Added to multi-quote — 2 posts selected.')

    toggleMultiquote(2)
    expect(multiquoteState().notice).toBe('Removed from multi-quote — 1 post selected.')

    toggleMultiquote(1)
    expect(multiquoteState().notice).toBe('Removed from multi-quote — nothing selected.')
  })

  it('says so when the selection is cleared', () => {
    toggleMultiquote(1)
    clearMultiquote()

    expect(multiquoteState().notice).toBe('Multi-quote cleared — nothing selected.')
    expect(multiquoteIds()).toEqual([])
  })

  it('counts what reached the reply, not what was asked for', () => {
    expect(addedNotice(1, 1)).toBe('1 quote added to your reply.')
    expect(addedNotice(3, 3)).toBe('3 quotes added to your reply.')
    expect(addedNotice(2, 3)).toBe('2 quotes added to your reply — 1 could not be quoted.')
    expect(addedNotice(0, 2)).toBe('Nothing could be quoted — your reply is untouched.')
  })

  it('labels the strip with the same count', () => {
    expect(selectionLabel(1)).toBe('1 post selected to quote')
    expect(selectionLabel(4)).toBe('4 posts selected to quote')
  })
})

describe('taking the selection', () => {
  it('hands back the ids and empties the store without an announcement', () => {
    toggleMultiquote(8)
    toggleMultiquote(9)

    expect(takeMultiquote()).toEqual([8, 9])
    expect(multiquoteIds()).toEqual([])
    expect(multiquoteState().notice).toBe('')
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('leaves an empty selection alone', () => {
    announceMultiquote('kept')

    expect(takeMultiquote()).toEqual([])
    expect(multiquoteState().notice).toBe('kept')
  })
})
