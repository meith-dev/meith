import {
  type CompiledSmilies,
  compileSmilies,
  createDirectiveRegistry,
  type DirectiveDefinition,
  type DirectiveRegistry,
  NO_DIRECTIVES,
  type SmileyDefinition,
} from './extensions'

export interface VocabularySource {
  readonly revision: number
  readonly smilies: readonly SmileyDefinition[]
  readonly directives: readonly DirectiveDefinition[]
}

export interface BoardVocabulary {
  readonly revision: number
  readonly directives: DirectiveRegistry
  readonly smilies: CompiledSmilies | undefined
  readonly rejected: readonly {
    readonly kind: 'smiley' | 'directive'
    readonly name: string
    readonly reason: string
  }[]
}

export const EMPTY_VOCABULARY: BoardVocabulary = {
  revision: 0,
  directives: NO_DIRECTIVES,
  smilies: undefined,
  rejected: [],
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

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
