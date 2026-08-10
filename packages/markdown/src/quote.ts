import { plainAuthorName } from './escape-source'

export interface QuoteInput {
  readonly author?: string | null
  readonly markdown: string
}

export function quoteBlock(input: QuoteInput): string {
  const author = input.author == null ? '' : plainAuthorName(input.author)
  const body = input.markdown.replace(/\r\n?/g, '\n').replace(/\s+$/, '')

  const quoted = body
    .split('\n')
    .map((line) => `> ${line}`.trimEnd())
    .join('\n')

  if (author === '') return quoted
  return `> **${author} wrote:**\n>\n${quoted}`
}
