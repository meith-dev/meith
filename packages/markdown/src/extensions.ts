import { escapeAttribute, escapeHtml } from './escape'
import { safeImageUrl } from './url'

export interface DirectiveDefinition {
  readonly name: string
  readonly block: boolean
}

export interface SmileyDefinition {
  readonly code: string
  readonly src: string
  readonly alt?: string
}

export interface CompiledSmilies {
  readonly entries: readonly Readonly<{ code: string; src: string; alt: string }>[]
}

export interface DirectiveRegistry {
  readonly block: ReadonlySet<string>
  readonly inline: ReadonlySet<string>
}

export const NO_DIRECTIVES: DirectiveRegistry = { block: new Set(), inline: new Set() }

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

export function directiveNames(registry: DirectiveRegistry): readonly string[] {
  return [...registry.block, ...registry.inline].sort()
}

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

  entries.sort((a, b) => b.code.length - a.code.length || a.code.localeCompare(b.code))
  return { entries }
}

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
