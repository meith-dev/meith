/**
 * F37/F71 — declarative extensions to the markup a board understands.
 *
 * Two primitives, and one rule that decides the shape of both: **a board's
 * configuration may never choose output markup.** A directive picks a name and
 * inline-or-block; a smiley picks a literal code and an image URL. Neither can
 * supply a renderer, a template, a regular expression, or HTML — those would
 * turn an ACP form into a second markup language and a permanent XSS surface,
 * which is the mechanism behind most of MyBB's custom-MyCode incidents.
 *
 * ## Directives, where BBCode had custom tags
 *
 * `[spoiler]…[/spoiler]` has no Markdown spelling, so a board's own additions
 * use the generic **directive** syntax the CommonMark community settled on:
 *
 *     :::spoiler             ← a block directive
 *     the ending
 *     :::
 *
 *     :spoiler[the ending]   ← the inline one
 *
 * It is the right shape for the same reason the BBCode version was: the name is
 * the only thing an operator chooses, and `render.ts` decides what a `spoiler`
 * looks like — a `div` or a `span` carrying one class the theme can style.
 */
import { escapeAttribute, escapeHtml } from './escape'
import { safeImageUrl } from './url'

export interface DirectiveDefinition {
  readonly name: string
  /** Block directives are `:::name` fences; inline ones are `:name[…]`. */
  readonly block: boolean
}

export interface SmileyDefinition {
  /** Literal source text, such as `:)`; never a regular expression. */
  readonly code: string
  /** A board-controlled URL or protected attachment route. */
  readonly src: string
  readonly alt?: string
}

export interface CompiledSmilies {
  readonly entries: readonly Readonly<{ code: string; src: string; alt: string }>[]
}

/** What the parser needs: which names exist, split by where they may appear. */
export interface DirectiveRegistry {
  readonly block: ReadonlySet<string>
  readonly inline: ReadonlySet<string>
}

export const NO_DIRECTIVES: DirectiveRegistry = { block: new Set(), inline: new Set() }

/**
 * Validate a board's directive names.
 *
 * Throws, because the caller is an admin form on the way in. The render path
 * never calls this directly — `compileVocabulary` does, one row at a time, and
 * turns a throw into a dropped row rather than a board that will not render.
 */
export function createDirectiveRegistry(
  definitions: readonly DirectiveDefinition[] = [],
): DirectiveRegistry {
  const block = new Set<string>()
  const inline = new Set<string>()

  for (const definition of definitions) {
    const name = definition.name.toLowerCase()
    if (!/^[a-z][a-z0-9]{0,15}$/.test(name)) {
      throw new Error('A directive name is 1–16 letters or digits and starts with a letter.')
    }
    if (block.has(name) || inline.has(name)) throw new Error(`Directive :${name} already exists.`)
    if (definition.block) block.add(name)
    else inline.add(name)
  }

  return { block, inline }
}

/** Every directive name, whichever position it takes. For the ACP and the help. */
export function directiveNames(registry: DirectiveRegistry): readonly string[] {
  return [...registry.block, ...registry.inline].sort()
}

/** Validate and sort literal smileys once, before rendering a page of posts. */
export function compileSmilies(definitions: readonly SmileyDefinition[]): CompiledSmilies {
  const codes = new Set<string>()
  const entries = definitions.map((definition) => {
    if (definition.code.length === 0 || definition.code.length > 32 || /\s/.test(definition.code)) {
      throw new Error('A smiley code must be 1–32 non-space characters.')
    }
    if (codes.has(definition.code)) throw new Error(`Smiley code ${definition.code} is duplicated.`)
    codes.add(definition.code)

    const src = safeImageUrl(definition.src)
    if (src === null) throw new Error(`Smiley ${definition.code} has an unsafe image URL.`)
    return { code: definition.code, src, alt: definition.alt ?? definition.code }
  })

  // Longest first means `:-)` wins over `:)` at the same character position.
  entries.sort((a, b) => b.code.length - a.code.length || a.code.localeCompare(b.code))
  return { entries }
}

/**
 * Escape a text node, expanding literal smileys as it goes.
 *
 * Only text nodes reach this. A code span or a fenced block is escaped by
 * `render.ts` directly, so `:)` inside `` `:)` `` stays two characters — which
 * is the guarantee working on the *tree* buys, and the one a second pass over
 * finished HTML could never make.
 */
export function renderSmilies(text: string, smilies: CompiledSmilies | undefined): string {
  if (smilies === undefined || smilies.entries.length === 0) return escapeHtml(text)

  let html = ''
  let cursor = 0
  while (cursor < text.length) {
    let match: (typeof smilies.entries)[number] | undefined
    for (const entry of smilies.entries) {
      if (text.startsWith(entry.code, cursor)) {
        match = entry
        break
      }
    }

    if (match === undefined) {
      html += escapeHtml(text[cursor]!)
      cursor += 1
      continue
    }

    html += `<img src="${escapeAttribute(match.src)}" alt="${escapeAttribute(match.alt)}" loading="lazy" class="md-smiley">`
    cursor += match.code.length
  }
  return html
}
