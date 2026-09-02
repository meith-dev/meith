export interface ComboboxKeyEvent {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
}

export interface ComboboxState {
  readonly count: number
  readonly active: number
}

export type ComboboxKeyAction =
  | { readonly type: 'move'; readonly active: number }
  | { readonly type: 'choose'; readonly index: number }
  | { readonly type: 'dismiss' }
  | null

export function comboboxKeyAction(
  event: ComboboxKeyEvent,
  state: ComboboxState,
): ComboboxKeyAction {
  const { count, active } = state
  if (count <= 0) return null

  switch (event.key) {
    case 'ArrowDown':
      return { type: 'move', active: (active + 1) % count }
    case 'ArrowUp':
      return { type: 'move', active: (active - 1 + count) % count }
    case 'Escape':
      return { type: 'dismiss' }
    case 'Enter':
    case 'Tab':
      return event.metaKey || event.ctrlKey ? null : { type: 'choose', index: active }
    default:
      return null
  }
}
