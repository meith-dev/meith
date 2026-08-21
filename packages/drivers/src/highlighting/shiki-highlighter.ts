import { createHighlighter, type Highlighter } from 'shiki'

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

export interface CodeHighlighter {
  highlight(code: string, language: string | undefined): Promise<string | null>
}

export const codeHighlighter: CodeHighlighter = {
  async highlight(code, language) {
    const resolved = resolveLanguage(language)
    if (resolved === null) return null

    const shiki = await getHighlighter()
    return shiki.codeToHtml(code, {
      lang: resolved,
      themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
      defaultColor: false,
      structure: 'inline',
    })
  },
}
