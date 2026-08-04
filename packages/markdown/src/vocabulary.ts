/**
 * F71 — the board's own additions to the markup language.
 *
 * F37 built the two primitives and refused to let either choose output markup:
 * a directive picks a name and inline-or-block, a smiley picks a literal code
 * and an image URL, and everything else is constructed by this package. What
 * was missing was the thing that holds them together, and one fact about it
 * that the rest of the codebase has to know:
 *
 * **The vocabulary is part of what the renderer is.** A smiley is expanded out
 * of a text node and a directive changes how the source parses, so both are
 * baked into a stored render — unlike the word filter, which runs over finished
 * HTML and can therefore be changed with no consequence at all. So a vocabulary
 * carries a `revision`, it is stamped onto every render it produces, and a
 * stored render whose stamp does not match is treated exactly as one from an
 * older `RENDER_VERSION`: rendered live, and rewritten behind the read path.
 *
 * ## Nothing here throws
 *
 * `compileSmilies` and `createDirectiveRegistry` both throw on bad input, which
 * is right where they are called — an admin form, on the way in. It is wrong
 * here: this runs on the render path, so a single malformed row would take out
 * every thread page on the board. A row that will not compile is **dropped and
 * counted**, because a board missing one smiley is a smaller problem than a
 * board that will not render.
 */
import {
  NO_DIRECTIVES,
  compileSmilies,
  createDirectiveRegistry,
  type CompiledSmilies,
  type DirectiveDefinition,
  type DirectiveRegistry,
  type SmileyDefinition,
} from './extensions'

export interface VocabularySource {
  /**
   * `cache_versions['markdown_vocabulary']`, bumped whenever an operator edits
   * either list. Zero means "a board that has never configured one", which is
   * also the column default — so a render stamped 0 by a board with no
   * vocabulary is current, and no backfill is triggered by installing the
   * feature.
   */
  readonly revision: number
  readonly smilies: readonly SmileyDefinition[]
  readonly directives: readonly DirectiveDefinition[]
}

export interface BoardVocabulary {
  readonly revision: number
  /** The directive names this board defines, split by position. */
  readonly directives: DirectiveRegistry
  /** `undefined` when the board has none, so the render path can skip the pass. */
  readonly smilies: CompiledSmilies | undefined
  /**
   * Rows that would not compile and were dropped.
   *
   * Surfaced rather than silently swallowed: an operator whose smiley does not
   * appear needs to be told which one and why, and the ACP is where that is
   * shown. On a board whose admin screens validate on the way in this is always
   * empty, which is the point — it is the seam for data that got in another way.
   */
  readonly rejected: readonly {
    readonly kind: 'smiley' | 'directive'
    readonly name: string
    readonly reason: string
  }[]
}

/** A board with nothing configured. The identity value, and revision 0. */
export const EMPTY_VOCABULARY: BoardVocabulary = {
  revision: 0,
  directives: NO_DIRECTIVES,
  smilies: undefined,
  rejected: [],
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Compile a board's vocabulary once, for a page of posts.
 *
 * Directives are added **one at a time** rather than in a single call, so one
 * bad row costs one directive instead of all of them. That is slower and it is
 * the behaviour worth having: the failure this guards against is an operator
 * discovering that adding a directive with a name collision quietly disabled
 * the three that already worked.
 */
export function compileVocabulary(source: VocabularySource): BoardVocabulary {
  const rejected: { kind: 'smiley' | 'directive'; name: string; reason: string }[] = []

  const accepted: DirectiveDefinition[] = []
  for (const directive of source.directives) {
    try {
      createDirectiveRegistry([...accepted, directive])
      accepted.push(directive)
    } catch (error) {
      rejected.push({ kind: 'directive', name: directive.name, reason: reasonOf(error) })
    }
  }

  /*
   * Smilies compile as a set, because the ordering rule — longest code first,
   * so `:-)` beats `:)` — is a property of the whole list rather than of any
   * entry. A rejected one is therefore found by adding them one at a time and
   * keeping what still compiles. The list is small by design, and this only
   * does extra work when a board already has a broken row.
   */
  const smilies: SmileyDefinition[] = []
  for (const smiley of source.smilies) {
    try {
      compileSmilies([...smilies, smiley])
      smilies.push(smiley)
    } catch (error) {
      rejected.push({ kind: 'smiley', name: smiley.code, reason: reasonOf(error) })
    }
  }

  return {
    revision: source.revision,
    directives: createDirectiveRegistry(accepted),
    smilies: smilies.length === 0 ? undefined : compileSmilies(smilies),
    rejected,
  }
}
