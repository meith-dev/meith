import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

function aliasesFromTsconfig(): Record<string, string> {
  const raw = readFileSync(resolve(root, 'tsconfig.base.json'), 'utf8')
  const json = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, '')) as {
    compilerOptions?: { paths?: Record<string, string[]> }
  }

  const paths = json.compilerOptions?.paths ?? {}
  const aliases: Record<string, string> = {}

  for (const [key, targets] of Object.entries(paths)) {
    const target = targets[0]
    if (!target) continue
    aliases[key.replace(/\/\*$/, '')] = resolve(root, target.replace(/\/\*$/, ''))
  }

  return aliases
}

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  resolve: {
    alias: {
      ...aliasesFromTsconfig(),
      'server-only': resolve(root, 'tests/stubs/server-only.ts'),
      '@': resolve(root, 'apps/community/src'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'apps/**/*.test.ts',
      'themes/**/*.test.ts',
      'plugins/**/*.test.ts',
      'examples/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/.next/**'],
    env: {
      NODE_ENV: 'test',
      DATA_SOURCE: 'fixture',
      LOG_LEVEL: 'fatal',
      SHOWCASE_THEMES: '1',
    },
    hookTimeout: 30_000,
    testTimeout: 20_000,
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
  },
})
