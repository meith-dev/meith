/**
 * `@meith/markdown` — F36.
 *
 * The one place raw member text becomes markup. Everything else on the board
 * either receives HTML from here or escapes text itself; nothing else builds a
 * tag out of something a member typed.
 *
 * Pipeline: `parse` (lines to blocks, blocks to inlines) → `renderDocument`.
 * Each stage is exported so a test can pin the stage rather than the
 * composition, and so F37's board vocabulary and F87's parity corpus can drive
 * the parser without the storage policy attached.
 *
 * `bbcodeToMarkdown` is the migration, not a second language: it converts old
 * source once and is never part of a write path. See `bbcode.ts`.
 */
export {
  BodyFormat,
  RENDER_VERSION,
  postBodyHtml,
  renderMarkdown,
  sourceAsMarkdown,
  vocabularyOptions,
  type MarkdownRenderOptions,
  type RenderablePost,
  type RenderedBody,
} from './body'
export { parse, type ParseOptions } from './blocks'
export { plainText, summarise } from './plain'
export { renderDocument, renderInline, type RenderContext } from './render'
export { parseInline, type InlineContext } from './inline'
export {
  textOf,
  type Alignment,
  type Block,
  type Inline,
  type ListItem,
  type MarkdownDocument,
  type TableCell,
} from './nodes'
export { escapeHtml, escapeAttribute } from './escape'
export { safeUrl, safeImageUrl, type UrlPolicy } from './url'
export { bbcodeToMarkdown } from './bbcode'
export { escapeMarkdownText, plainAuthorName } from './escape-source'
export { extractMentions, extractQuotedAuthors, mentionHref } from './mention'
export { quoteBlock, type QuoteInput } from './quote'
export {
  applyWordFilter,
  compileWordFilter,
  type CompiledWordFilter,
  type WordFilterRule,
} from './word-filter'
export {
  FULL_FEATURES,
  SIGNATURE_FEATURES,
  type MarkdownFeatures,
} from './features'
export {
  NO_DIRECTIVES,
  compileSmilies,
  createDirectiveRegistry,
  directiveNames,
  renderSmilies,
  type CompiledSmilies,
  type DirectiveDefinition,
  type DirectiveRegistry,
  type SmileyDefinition,
} from './extensions'
export { DEFAULT_LIMITS, type MarkdownLimits } from './limits'
export {
  EMPTY_VOCABULARY,
  compileVocabulary,
  type BoardVocabulary,
  type VocabularySource,
} from './vocabulary'
