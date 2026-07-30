import { getThemeRuntimeStyle } from '@/server/theme-runtime'

/** Server-rendered, tagged runtime token cascade. */
export async function ThemeRuntimeStyle() {
  const { css } = await getThemeRuntimeStyle()
  return css === '' ? null : <style id="forum-theme-overrides">{css}</style>
}
