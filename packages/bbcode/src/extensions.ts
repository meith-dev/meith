/**
 * F37 — declarative BBCode extensions.
 *
 * A custom tag can choose only its name and inline/block shape. It cannot
 * provide a renderer, template, regex, or HTML: those would turn an ACP form
 * into a second markup language and a permanent XSS surface.
 */
import { escapeAttribute, escapeHtml } from './escape'
import { TAGS, type TagSpec } from './tags'
import { safeImageUrl } from './url'

type Registry = Readonly<Record<string, TagSpec>>

export interface CustomTagDefinition {
  readonly name: string
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

/**
 * Add custom tags without letting a configuration value choose output markup.
 * Existing tags cannot be overridden: changing `[url]` must be a code review,
 * not an admin setting.
 */
export function createTagRegistry(
  customTags: readonly CustomTagDefinition[] = [],
  base: Registry = TAGS,
): Registry {
  const registry: Record<string, TagSpec> = { ...base }

  for (const definition of customTags) {
    const name = definition.name.toLowerCase()
    if (!/^[a-z][a-z0-9]{0,15}$/.test(name)) {
      throw new Error('Custom BBCode names use 1–16 letters or digits and start with a letter.')
    }
    if (registry[name] !== undefined) throw new Error(`BBCode tag [${name}] already exists.`)

    const element = definition.block ? 'div' : 'span'
    registry[name] = {
      raw: false,
      block: definition.block,
      selfClosing: false,
      parents: null,
      render: (context) =>
        `<${element} class="bb-custom bb-custom-${escapeAttribute(name)}">${context.html}</${element}>`,
    }
  }

  return registry
}

/**
 * Per-forum capability toggle. Disabled tags are not parsed, so their source
 * remains visible rather than silently losing a member's text.
 */
export function restrictTagRegistry(registry: Registry, enabled: readonly string[]): Registry {
  const allowed = new Set(enabled.map((name) => name.toLowerCase()))
  const restricted: Record<string, TagSpec> = {}

  for (const [name, spec] of Object.entries(registry)) {
    if (allowed.has(name) || (name === '*' && allowed.has('list'))) restricted[name] = spec
  }
  return restricted
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

/** Render literal smileys in ordinary text only; raw `[code]` bodies bypass this. */
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

    html += `<img src="${escapeAttribute(match.src)}" alt="${escapeAttribute(match.alt)}" loading="lazy" class="bb-smiley">`
    cursor += match.code.length
  }
  return html
}
