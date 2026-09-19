import { DARK_TOKENS as DEFAULT_DARK, LIGHT_TOKENS as DEFAULT_LIGHT } from '@meith/theme-default'

const SANS =
  'var(--font-inter), "Inter var", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

const MONO =
  'ui-monospace, "JetBrains Mono", "SF Mono", "SFMono-Regular", Menlo, Consolas, monospace'

export const LIGHT_TOKENS: Record<string, string> = {
  ...DEFAULT_LIGHT,
  background: 'oklch(0.991 0.001 286.4)',
  foreground: 'oklch(0.159 0.011 268)',
  surface: 'oklch(0.97 0.004 271.4)',
  card: 'oklch(0.991 0.001 286.4)',
  'card-foreground': 'oklch(0.159 0.011 268)',
  primary: 'oklch(0.508 0.105 165.6)',
  'primary-foreground': 'oklch(1 0 0)',
  'primary-hover': 'oklch(0.434 0.089 165.6)',
  secondary: 'oklch(0.97 0.004 271.4)',
  'secondary-foreground': 'oklch(0.159 0.011 268)',
  muted: 'oklch(0.97 0.004 271.4)',
  'muted-foreground': 'oklch(0.449 0.025 264.3)',
  accent: 'oklch(0.974 0.007 174.4)',
  'accent-foreground': 'oklch(0.159 0.011 268)',
  border: 'oklch(0.925 0.007 268.5)',
  input: 'oklch(0.64 0.012 264.5)',
  ring: 'oklch(0.508 0.105 165.6)',
  'shadow-tint': 'oklch(0.159 0.011 268 / 0%)',
  radius: '0rem',
  'density-unit': '0.25rem',
  'font-mono-stack': MONO,
  'font-sans-stack': SANS,
  'font-heading-stack': 'var(--font-sans-stack)',
  elevation: 'none',
  'forum-unread': 'oklch(0.159 0.011 268)',
  'forum-read': 'oklch(0.5 0.02 261.3)',
  'thread-moved': 'oklch(0.5 0.02 261.3)',
  'post-own': 'oklch(0.97 0.004 271.4)',
  'group-banned': 'oklch(0.5 0.02 261.3)',
}

export const DARK_TOKENS: Record<string, string> = {
  ...DEFAULT_DARK,
  background: 'oklch(0.14 0.007 269.7)',
  foreground: 'oklch(0.964 0.004 271.4)',
  surface: 'oklch(0.168 0.009 264.3)',
  card: 'oklch(0.14 0.007 269.7)',
  'card-foreground': 'oklch(0.964 0.004 271.4)',
  primary: 'oklch(0.773 0.153 163.2)',
  'primary-foreground': 'oklch(0.181 0.029 166.6)',
  'primary-hover': 'oklch(0.84 0.139 166.8)',
  secondary: 'oklch(0.168 0.009 264.3)',
  'secondary-foreground': 'oklch(0.964 0.004 271.4)',
  muted: 'oklch(0.168 0.009 264.3)',
  'muted-foreground': 'oklch(0.734 0.02 265.9)',
  accent: 'oklch(0.171 0.011 207.1)',
  'accent-foreground': 'oklch(0.964 0.004 271.4)',
  border: 'oklch(0.262 0.023 270.4)',
  input: 'oklch(0.52 0.026 269.6)',
  ring: 'oklch(0.773 0.153 163.2)',
  'shadow-tint': 'oklch(0 0 0 / 0%)',
  radius: '0rem',
  'density-unit': '0.25rem',
  'font-mono-stack': MONO,
  'font-sans-stack': SANS,
  'font-heading-stack': 'var(--font-sans-stack)',
  elevation: 'none',
  'forum-unread': 'oklch(0.964 0.004 271.4)',
  'forum-read': 'oklch(0.68 0.02 264.4)',
  'thread-moved': 'oklch(0.68 0.02 264.4)',
  'post-own': 'oklch(0.168 0.009 264.3)',
  'group-banned': 'oklch(0.68 0.02 264.4)',
}

export const BROWSER_THEME_COLOR = {
  light: '#fcfcfd',
  dark: '#08090c',
} as const
