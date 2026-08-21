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
  /**
   * The post this text belongs to, when it already has one — an edit, not a
   * fresh post or a preview. An inline `[attachment=id]` renders as more than
   * a placeholder only once something with database access resolves it (see
   * apps/community's attachment-embed.ts), and that resolution needs to know
   * which post an already-claimed attachment must belong to.
   */
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
