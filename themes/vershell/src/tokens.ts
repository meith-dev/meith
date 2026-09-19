import { DARK_TOKENS as DEFAULT_DARK, LIGHT_TOKENS as DEFAULT_LIGHT } from '@meith/theme-default'

const SANS =
  '"Geist", "Geist Sans", var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

const MONO =
  '"Geist Mono", ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, "Roboto Mono", monospace'

const ELEVATION = '0 1px 2px 0 var(--shadow-tint), 0 8px 20px -12px var(--shadow-tint)'

export const LIGHT_TOKENS: Record<string, string> = {
  ...DEFAULT_LIGHT,
  background: 'oklch(0.985 0 0)',
  foreground: 'oklch(0.205 0 0)',
  surface: 'oklch(0.961 0 0)',
  card: 'oklch(1 0 0)',
  'card-foreground': 'oklch(0.205 0 0)',
  primary: 'oklch(0.551 0.205 258.2)',
  'primary-foreground': 'oklch(1 0 0)',
  'primary-hover': 'oklch(0.507 0.185 257.7)',
  secondary: 'oklch(0.961 0 0)',
  'secondary-foreground': 'oklch(0.205 0 0)',
  muted: 'oklch(0.961 0 0)',
  'muted-foreground': 'oklch(0.51 0 0)',
  accent: 'oklch(0.94 0 0)',
  'accent-foreground': 'oklch(0.205 0 0)',
  border: 'oklch(0.937 0 0)',
  input: 'oklch(0.65 0 0)',
  ring: 'oklch(0.551 0.205 258.2)',
  'shadow-tint': 'oklch(0.205 0 0 / 6%)',
  radius: '0.375rem',
  'density-unit': '0.25rem',
  'font-mono-stack': MONO,
  'font-sans-stack': SANS,
  'font-heading-stack': 'var(--font-sans-stack)',
  elevation: ELEVATION,
  'forum-unread': 'oklch(0.205 0 0)',
  'forum-read': 'oklch(0.51 0 0)',
  'thread-moved': 'oklch(0.51 0 0)',
  'post-own': 'oklch(0.976 0 0)',
  'group-banned': 'oklch(0.51 0 0)',
}

export const DARK_TOKENS: Record<string, string> = {
  ...DEFAULT_DARK,
  background: 'oklch(0.145 0 0)',
  foreground: 'oklch(0.946 0 0)',
  surface: 'oklch(0.218 0 0)',
  card: 'oklch(0.191 0 0)',
  'card-foreground': 'oklch(0.946 0 0)',
  primary: 'oklch(0.653 0.172 259.7)',
  'primary-foreground': 'oklch(0.183 0.03 251.4)',
  'primary-hover': 'oklch(0.717 0.147 259.9)',
  secondary: 'oklch(0.218 0 0)',
  'secondary-foreground': 'oklch(0.946 0 0)',
  muted: 'oklch(0.218 0 0)',
  'muted-foreground': 'oklch(0.709 0 0)',
  accent: 'oklch(0.26 0 0)',
  'accent-foreground': 'oklch(0.946 0 0)',
  border: 'oklch(0.285 0 0)',
  input: 'oklch(0.528 0 0)',
  ring: 'oklch(0.653 0.172 259.7)',
  'shadow-tint': 'oklch(0 0 0 / 55%)',
  radius: '0.375rem',
  'density-unit': '0.25rem',
  'font-mono-stack': MONO,
  'font-sans-stack': SANS,
  'font-heading-stack': 'var(--font-sans-stack)',
  elevation: ELEVATION,
  'forum-unread': 'oklch(0.946 0 0)',
  'forum-read': 'oklch(0.65 0 0)',
  'thread-moved': 'oklch(0.65 0 0)',
  'post-own': 'oklch(0.205 0 0)',
  'group-banned': 'oklch(0.65 0 0)',
}

export const BROWSER_THEME_COLOR = {
  light: '#fafafa',
  dark: '#0a0a0a',
} as const
