import { applyWordFilter, applyWordFilterText, type CompiledWordFilter } from '@meith/markdown'

export function filterWords(text: string, filter: CompiledWordFilter | undefined): string {
  return filter === undefined ? text : applyWordFilterText(text, filter)
}

export function filterHtmlWords(html: string, filter: CompiledWordFilter | undefined): string {
  return filter === undefined ? html : applyWordFilter(html, filter)
}
