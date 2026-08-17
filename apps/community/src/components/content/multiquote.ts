'use client'

import { useSyncExternalStore } from 'react'

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
    return [
      ...new Set(parsed.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)),
    ]
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

function counted(count: number): string {
  if (count === 0) return 'nothing selected'
  return count === 1 ? '1 post selected' : `${count} posts selected`
}

export function selectionLabel(count: number): string {
  return `${counted(count)} to quote`
}

function selectionNotice(count: number, change: 'added' | 'removed'): string {
  const verb = change === 'added' ? 'Added to multi-quote' : 'Removed from multi-quote'
  return `${verb} — ${counted(count)}.`
}

export function addedNotice(added: number, asked: number): string {
  if (added === 0) return 'Nothing could be quoted — your reply is untouched.'
  const quotes = added === 1 ? '1 quote' : `${added} quotes`
  if (added === asked) return `${quotes} added to your reply.`
  return `${quotes} added to your reply — ${asked - added} could not be quoted.`
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

export function toggleMultiquote(postId: number): void {
  const { ids } = multiquoteState()
  const held = ids.includes(postId)
  const next = held ? ids.filter((id) => id !== postId) : [...ids, postId]

  write(next)
  publish(next, selectionNotice(next.length, held ? 'removed' : 'added'))
}

export function clearMultiquote(): void {
  write([])
  publish([], 'Multi-quote cleared — nothing selected.')
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
