import { bbcodeToMarkdown } from './bbcode'
import { parse, type ParseOptions } from './blocks'
import type { CompiledSmilies } from './extensions'
import { renderDocument } from './render'
import type { BoardVocabulary } from './vocabulary'

export const RENDER_VERSION = 2

export const BodyFormat = {
  LegacyBBCode: 0,
  Markdown: 1,
} as const
export type BodyFormat = (typeof BodyFormat)[keyof typeof BodyFormat]

export interface RenderedBody {
  readonly html: string
  readonly truncated: boolean
  readonly version: number
}

export interface MarkdownRenderOptions extends ParseOptions {
  readonly smilies?: CompiledSmilies | undefined
  readonly headingOffset?: number
}

export function renderMarkdown(source: string, options: MarkdownRenderOptions = {}): RenderedBody {
  const document = parse(source, options)
  return {
    html: renderDocument(document, {
      smilies: options.smilies,
      ...(options.headingOffset === undefined ? {} : { headingOffset: options.headingOffset }),
    }),
    truncated: document.truncated,
    version: RENDER_VERSION,
  }
}

export function sourceAsMarkdown(source: string, format: number | undefined): string {
  return (format ?? BodyFormat.Markdown) === BodyFormat.LegacyBBCode ? bbcodeToMarkdown(source) : source
}

export interface RenderablePost {
  readonly message: string
  readonly messageHtml: string | null
  readonly renderVersion: number
  readonly bodyFormat?: number
  readonly vocabVersion?: number
}

export function postBodyHtml(post: RenderablePost, vocabulary?: BoardVocabulary): string {
  const revision = vocabulary?.revision ?? 0
  const format = post.bodyFormat ?? BodyFormat.Markdown

  if (
    post.messageHtml !== null &&
    post.renderVersion === RENDER_VERSION &&
    format === BodyFormat.Markdown &&
    (post.vocabVersion ?? 0) === revision
  ) {
    return post.messageHtml
  }

  return renderMarkdown(sourceAsMarkdown(post.message, format), vocabularyOptions(vocabulary)).html
}

export function vocabularyOptions(vocabulary: BoardVocabulary | undefined): MarkdownRenderOptions {
  if (vocabulary === undefined) return {}
  return vocabulary.smilies === undefined
    ? { directives: vocabulary.directives }
    : { directives: vocabulary.directives, smilies: vocabulary.smilies }
}
