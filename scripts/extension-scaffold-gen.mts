#!/usr/bin/env -S npx tsx
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { formatWithBiome } from './board-plugins.mjs'
import { emitGeneratedDoc } from './generated-doc.mjs'
import { ROOT } from './workspace-packages.mjs'

export const OUTPUT_FILE = 'packages/create-meith/src/extension-templates.ts'

export const KEY_TOKEN = '__MEITH_EXTENSION_KEY__'
export const TITLE_TOKEN = '__MEITH_EXTENSION_TITLE__'
export const CAMEL_TOKEN = '__MEITH_EXTENSION_CAMEL__'
export const SNAKE_TOKEN = '__MEITH_EXTENSION_SNAKE__'
export const REPOSITORY_TOKEN = '__MEITH_EXTENSION_REPOSITORY__'

export interface TemplateFile {
  readonly path: string
  readonly contents: string
}

export const PLUGIN_EXAMPLE = 'examples/hello-plugin'
export const THEME_EXAMPLE = 'examples/iris-theme'

export const PLUGIN_SOURCE_FILES = ['src/plugin.tsx', 'src/plugin.test.ts'] as const

export const THEME_SOURCE_FILES = [
  'src/index.ts',
  'src/theme.ts',
  'src/tokens.ts',
  'src/slots/footer.tsx',
  'src/theme.test.ts',
] as const

export const PLUGIN_SUBSTITUTIONS: readonly (readonly [string, string])[] = [
  [
    'The worked example from examples/hello-plugin: a footer link, a greeting ',
    'A plugin scaffolded by create-meith: a footer link, a greeting ',
  ],
  ['Hello from the Hello plugin!', `A greeting from the ${TITLE_TOKEN} plugin!`],
  [
    'Hello, guest — this line comes from the example plugin.',
    `Greetings, guest — this line comes from the ${TITLE_TOKEN} plugin.`,
  ],
  [
    'Hello, member — this line comes from the example plugin.',
    `Greetings, member — this line comes from the ${TITLE_TOKEN} plugin.`,
  ],
  ['https://github.com/meith-dev/meith/tree/main/examples/hello-plugin', REPOSITORY_TOKEN],
  ['examples/hello-plugin', REPOSITORY_TOKEN],
  ['plugin_hello_wave', `plugin_${SNAKE_TOKEN}_wave`],
  ['helloPlugin', `${CAMEL_TOKEN}Plugin`],
  ['hello', KEY_TOKEN],
  ['Hello', TITLE_TOKEN],
]

export const THEME_SUBSTITUTIONS: readonly (readonly [string, string])[] = [
  ['irisTheme', `${CAMEL_TOKEN}Theme`],
  ['iris', KEY_TOKEN],
  ['Iris', TITLE_TOKEN],
]

export function transformSources(
  files: readonly TemplateFile[],
  substitutions: readonly (readonly [string, string])[],
  forbidden: RegExp,
): readonly TemplateFile[] {
  const matched = new Set<string>()

  const out = files.map(({ path, contents }) => {
    let text = contents
    for (const [from, to] of substitutions) {
      if (text.includes(from)) {
        matched.add(from)
        text = text.replaceAll(from, to)
      }
    }
    return { path, contents: text }
  })

  for (const [from] of substitutions) {
    if (!matched.has(from)) {
      throw new Error(
        `extension-scaffold-gen: anchor ${JSON.stringify(from)} matched nothing. The example ` +
          'it was written against has moved — update the substitution list to follow it.',
      )
    }
  }

  for (const { path, contents } of out) {
    const hit = forbidden.exec(contents)
    if (hit !== null) {
      throw new Error(
        `extension-scaffold-gen: ${path} still contains ${JSON.stringify(hit[0])} after ` +
          'substitution. Add a substitution for it so a scaffolded workspace never carries ' +
          "the example's own name.",
      )
    }
  }

  return out
}

export function renderTemplatesModule(
  plugin: readonly TemplateFile[],
  theme: readonly TemplateFile[],
): string {
  const render = (files: readonly TemplateFile[]) =>
    files
      .map(
        ({ path, contents }) =>
          `  { path: ${JSON.stringify(path)}, contents: ${JSON.stringify(contents)} },`,
      )
      .join('\n')

  return `// biome-ignore-all lint/suspicious/noTemplateCurlyInString: template contents are emitted into scaffolded files verbatim, never interpolated here
import type { ExtensionTemplate } from './scaffold-extension'

export const PLUGIN_TEMPLATES: readonly ExtensionTemplate[] = [
${render(plugin)}
]

export const THEME_TEMPLATES: readonly ExtensionTemplate[] = [
${render(theme)}
]
`
}

async function readSources(
  example: string,
  sources: readonly string[],
): Promise<readonly TemplateFile[]> {
  return Promise.all(
    sources.map(async (path) => ({
      path,
      contents: await readFile(join(ROOT, example, path), 'utf8'),
    })),
  )
}

async function main() {
  const plugin = transformSources(
    await readSources(PLUGIN_EXAMPLE, PLUGIN_SOURCE_FILES),
    PLUGIN_SUBSTITUTIONS,
    /hello/i,
  )
  const theme = transformSources(
    await readSources(THEME_EXAMPLE, THEME_SOURCE_FILES),
    THEME_SUBSTITUTIONS,
    /iris/i,
  )

  const generated = await formatWithBiome(renderTemplatesModule(plugin, theme), { root: ROOT })

  await emitGeneratedDoc({
    outputFile: OUTPUT_FILE,
    generated,
    staleReason:
      'The extension scaffold templates are generated from examples/hello-plugin and ' +
      'examples/iris-theme. One of the examples changed — run `pnpm extension:gen` and ' +
      'commit the result.',
    upToDate: `${plugin.length + theme.length} template file(s)`,
    wrote: `${plugin.length + theme.length} template file(s)`,
  })
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main()
}
