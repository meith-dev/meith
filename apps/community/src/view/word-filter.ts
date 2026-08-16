import { applyWordFilter, type CompiledWordFilter } from '@meith/markdown'

export function filterWords(text: string, filter: CompiledWordFilter | undefined): string {
  return filter === undefined ? text : applyWordFilter(text, filter)
}
