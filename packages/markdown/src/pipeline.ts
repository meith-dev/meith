import { type MarkdownRenderOptions, type RenderedBody, renderMarkdown } from './body'
import type { VocabularySource } from './vocabulary'

export type MarkdownSourceKind = 'post' | 'signature' | 'pm'

export interface MarkdownAuthorRef {
  readonly userId: number | null
  readonly isGuest: boolean
}

export interface MarkdownRenderContext {
  readonly source: MarkdownSourceKind
  readonly viewer: MarkdownAuthorRef
  readonly postId?: number | null
}

export interface MarkdownPipeline {
  readonly text: (text: string, context: MarkdownRenderContext) => Promise<string>
  readonly html: (html: string, context: MarkdownRenderContext) => Promise<string>
  readonly vocabulary: (source: VocabularySource) => Promise<VocabularySource>
}

export const CORE_RENDERING: MarkdownPipeline = {
  text: async (text) => text,
  html: async (html) => html,
  vocabulary: async (source) => source,
}

export const NO_VOCABULARY_SOURCE: VocabularySource = {
  revision: 0,
  smilies: [],
  directives: [],
}

export function authorRef(userId: number | null): MarkdownAuthorRef {
  return { userId, isGuest: userId === null }
}

export async function renderThrough(
  pipeline: MarkdownPipeline,
  text: string,
  context: MarkdownRenderContext,
  options: MarkdownRenderOptions = {},
): Promise<RenderedBody> {
  const rendered = renderMarkdown(await pipeline.text(text, context), options)
  return { ...rendered, html: await pipeline.html(rendered.html, context) }
}
