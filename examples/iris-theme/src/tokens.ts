import {
  DARK_TOKENS as DEFAULT_DARK,
  LIGHT_TOKENS as DEFAULT_LIGHT,
} from '@meith/theme-default'

export const LIGHT_TOKENS: Record<string, string> = {
  ...DEFAULT_LIGHT,
  primary: 'oklch(0.49 0.19 300)',
  'primary-hover': 'oklch(0.42 0.17 300)',
  ring: 'oklch(0.49 0.19 300)',
}

export const DARK_TOKENS: Record<string, string> = {
  ...DEFAULT_DARK,
  primary: 'oklch(0.78 0.12 300)',
  'primary-foreground': 'oklch(0.18 0.03 300)',
  'primary-hover': 'oklch(0.84 0.11 300)',
  ring: 'oklch(0.78 0.12 300)',
}

export { BROWSER_THEME_COLOR } from '@meith/theme-default'
