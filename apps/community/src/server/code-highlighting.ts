import 'server-only'

import { createHighlighter, type Highlighter } from 'shiki'

import { escapeAttribute, unescapeHtml } from '@meith/markdown'

const LANGUAGES = [
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'diff',
  'dockerfile',
  'go',
  'graphql',
  'html',
  'http',
  'ini',
  'java',
  'json',
  'kotlin',
  'markdown',
  'php',
  'python',
  'ruby',
  'rust',
  'sql',
  'swift',
  'toml',
  'tsx',
  'typescript',
  'yaml',
] as const

type Language = (typeof LANGUAGES)[number]

const ALIASES: Readonly<Record<string, Language>> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  'c++': 'cpp',
  cs: 'csharp',
  js: 'typescript',
  jsx: 'tsx',
  javascript: 'typescript',
  mjs: 'typescript',
  cjs: 'typescript',
  ts: 'typescript',
  py: 'python',
  python3: 'python',
  rb: 'ruby',
  rs: 'rust',
  md: 'markdown',
  yml: 'yaml',
  env: 'ini',
  docker: 'dockerfile',
  golang: 'go',
}

function resolveLanguage(requested: string | undefined): Language | null {
  if (requested === undefined) return null
  const lower = requested.toLowerCase()
  const resolved = ALIASES[lower] ?? lower
  return (LANGUAGES as readonly string[]).includes(resolved) ? (resolved as Language) : null
}

let highlighter: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({
    themes: ['vitesse-light', 'vitesse-dark'],
    langs: [...LANGUAGES],
  })
  return highlighter
}

const CODE_BLOCK =
  /<pre class="md-code"><code(?: class="md-code-lang-([a-z0-9+#._-]+)")?>([\s\S]*?)\n<\/code><\/pre>/g

export async function highlightCodeBlocks(html: string): Promise<string> {
  if (!html.includes('md-code')) return html

  const allMatches = [...html.matchAll(CODE_BLOCK)]
  const matches = allMatches.filter((match) => resolveLanguage(match[1]) !== null)
  if (matches.length === 0) return html

  const shiki = await getHighlighter()
  const replacements = new Map<string, string>()

  for (const match of matches) {
    const whole = match[0]
    if (replacements.has(whole)) continue

    const language = resolveLanguage(match[1])!
    const code = unescapeHtml(match[2] ?? '')
    const highlighted = shiki.codeToHtml(code, {
      lang: language,
      themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
      defaultColor: false,
      structure: 'inline',
    })

    replacements.set(
      whole,
      `<pre class="md-code" data-lang="${escapeAttribute(match[1]!)}"><code class="md-code-lang-${escapeAttribute(match[1]!)}">${highlighted}</code></pre>`,
    )
  }

  return html.replace(CODE_BLOCK, (whole) => replacements.get(whole) ?? whole)
}
