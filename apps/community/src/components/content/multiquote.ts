'use client'

import { useSyncExternalStore } from 'react'

import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'

const KEY = 'multiquote'

export interface MultiQuoteState {
  readonly ids: readonly number[]
  readonly notice: string
}

const EMPTY: MultiQuoteState = { ids: [], notice: '' }

let state: MultiQuoteState = EMPTY
const listeners = new Set<() => void>()

function read(): readonly number[] {
  let raw: string | null
  try {
    raw = sessionStorage.getItem(KEY)
  } catch {
    return state.ids
  }

  try {
    const parsed: unknown = JSON.parse(raw ?? '[]')
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
  } catch {
    return []
  }
}

function write(ids: readonly number[]): void {
  try {
    if (ids.length === 0) sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    return
  }
}

function same(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function publish(ids: readonly number[], notice: string): void {
  state = { ids, notice }
  for (const listener of listeners) listener()
}

export function selectionLabel(count: number, copy: Copy): string {
  return formatFromCopy(copy, 'composer.multiquote.selectedToQuote', { count })
}

function selectionNotice(count: number, change: 'added' | 'removed', copy: Copy): string {
  return formatFromCopy(
    copy,
    change === 'added' ? 'composer.multiquote.added' : 'composer.multiquote.removed',
    { count },
  )
}

export function addedNotice(added: number, asked: number, copy: Copy): string {
  if (added === 0) return fromCopy(copy, 'composer.multiquote.noneQuoted')
  if (added === asked) return formatFromCopy(copy, 'composer.multiquote.quotesAdded', { added })
  return formatFromCopy(copy, 'composer.multiquote.quotesPartial', {
    added,
    missed: asked - added,
  })
}

export function multiquoteState(): MultiQuoteState {
  const ids = read()
  if (!same(ids, state.ids)) state = { ids, notice: state.notice }
  return state
}

export function serverMultiquoteState(): MultiQuoteState {
  return EMPTY
}

export function multiquoteIds(): readonly number[] {
  return multiquoteState().ids
}

export function toggleMultiquote(postId: number, copy: Copy): void {
  const { ids } = multiquoteState()
  const held = ids.includes(postId)
  const next = held ? ids.filter((id) => id !== postId) : [...ids, postId]

  write(next)
  publish(next, selectionNotice(next.length, held ? 'removed' : 'added', copy))
}

export function clearMultiquote(copy: Copy): void {
  write([])
  publish([], fromCopy(copy, 'composer.multiquote.cleared'))
}

export function takeMultiquote(): readonly number[] {
  const { ids } = multiquoteState()
  if (ids.length === 0) return ids

  write([])
  publish([], '')
  return ids
}

export function announceMultiquote(notice: string): void {
  publish(multiquoteState().ids, notice)
}

export function subscribeMultiquote(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useMultiquote(): MultiQuoteState {
  return useSyncExternalStore(subscribeMultiquote, multiquoteState, serverMultiquoteState)
}
