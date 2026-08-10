import { getBoardThemeStyle } from '@/server/theme-runtime'

export async function ThemeRuntimeStyle() {
  const { css } = await getBoardThemeStyle()
  return css === '' ? null : <style id="forum-theme-overrides">{css}</style>
}
