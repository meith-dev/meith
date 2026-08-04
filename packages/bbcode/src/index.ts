/**
 * `@meith/bbcode` — F36.
 *
 * The one place raw member text becomes markup. Everything else on the board
 * either receives HTML from here or escapes text itself; nothing else builds a
 * tag out of something a member typed.
 *
 * Pipeline: `tokenise` → `parse` → `render`. Each stage is exported so a test
 * can pin the stage rather than the composition, and so F37's custom tags and
 * F87's parity corpus can drive the parser without the storage policy attached.
 */
export {
  RENDER_VERSION,
  postBodyHtml,
  renderBBCode,
  type RenderablePost,
  type RenderedBody,
  type BBCodeRenderOptions,
} from './body'
export { parse, type ParseOptions } from './parse'
export { renderDocument, renderNodes } from './render'
export { tokenise, type BBToken, type TokeniseOptions } from './tokenise'
export { textOf, type BBDocument, type BBNode } from './ast'
export { escapeHtml, escapeAttribute } from './escape'
export { safeUrl, safeImageUrl, type UrlPolicy } from './url'
export {
  applyWordFilter,
  compileWordFilter,
  type CompiledWordFilter,
  type WordFilterRule,
} from './word-filter'
export { RAW_TAGS, TAGS, type RenderContext, type TagSpec } from './tags'
export {
  compileSmilies,
  createTagRegistry,
  renderSmilies,
  restrictTagRegistry,
  type CompiledSmilies,
  type CustomTagDefinition,
  type SmileyDefinition,
} from './extensions'
export { DEFAULT_LIMITS, type BBCodeLimits } from './limits'
