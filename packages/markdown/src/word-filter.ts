import { escapeHtml } from './escape'

export interface WordFilterRule {
  readonly pattern: string
  readonly replacement: string
  readonly wholeWord: boolean
}

export interface CompiledWordFilter {
  readonly rules: readonly { readonly matcher: RegExp; readonly replacement: string }[]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function compileWordFilter(rules: readonly WordFilterRule[]): CompiledWordFilter {
  return {
    rules: rules
      .filter((rule) => rule.pattern !== '')
      .map((rule) => ({
        matcher: new RegExp(
          rule.wholeWord ? `\\b${escapeRegExp(rule.pattern)}\\b` : escapeRegExp(rule.pattern),
          'gi',
        ),
        replacement: rule.replacement,
      })),
  }
}

export function applyWordFilter(html: string, filter: CompiledWordFilter): string {
  if (filter.rules.length === 0 || html === '') return html

  let output = ''
  let index = 0

  while (index < html.length) {
    const tagStart = html.indexOf('<', index)

    if (tagStart === -1) {
      output += substitute(html.slice(index), filter)
      break
    }

    output += substitute(html.slice(index, tagStart), filter)

    const tagEnd = html.indexOf('>', tagStart)
    if (tagEnd === -1) {
      output += html.slice(tagStart)
      break
    }

    output += html.slice(tagStart, tagEnd + 1)
    index = tagEnd + 1
  }

  return output
}

function substitute(text: string, filter: CompiledWordFilter): string {
  return text
    .split(/(&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi)
    .map((part, index) => (index % 2 === 1 ? part : escapeHtml(applyWordFilterText(part, filter))))
    .join('')
}

export function applyWordFilterText(text: string, filter: CompiledWordFilter): string {
  let result = text
  for (const rule of filter.rules) {
    result = result.replace(rule.matcher, () => rule.replacement)
  }
  return result
}
