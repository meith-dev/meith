import { normaliseOrigin } from './origin'
import type { SettingsSnapshot } from './store'

export interface BoardUrlEnvironment {
  readonly APP_URL?: string | undefined
}

export type BoardUrlSource = 'environment' | 'board' | 'none'

export interface BoardUrlResolution {
  readonly url: string
  readonly source: BoardUrlSource
}

export function resolveBoardUrl(input: {
  readonly environment: BoardUrlEnvironment
  readonly settings: SettingsSnapshot
}): BoardUrlResolution {
  const fromEnvironment = normaliseOrigin(input.environment.APP_URL ?? '')
  if (fromEnvironment !== '') return { url: fromEnvironment, source: 'environment' }

  const stored = normaliseOrigin(input.settings.get('board.url'))
  return stored === '' ? { url: '', source: 'none' } : { url: stored, source: 'board' }
}

export { isUsableOrigin, normaliseOrigin } from './origin'
