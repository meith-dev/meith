import { PLUGIN_TEMPLATES, THEME_TEMPLATES } from './extension-templates'

export type ExtensionKind = 'plugin' | 'theme'

export interface ExtensionTemplate {
  readonly path: string
  readonly contents: string
}

export interface ExtensionScaffoldOptions {
  readonly name: string
  readonly version: string
  readonly repositoryUrl?: string | undefined
}

export const EXTENSION_KEY_PATTERN = /^[a-z][a-z0-9-]{1,39}$/

export function validateExtensionName(name: string): string | null {
  if (name === '') return 'An extension name is required.'
  if (!EXTENSION_KEY_PATTERN.test(name)) {
    return (
      'Use lower-case letters, digits and hyphens, starting with a letter, 2 to 40 characters — ' +
      'the name becomes the definePlugin/defineTheme key and the npm package name.'
    )
  }
  return null
}

export function extensionTitle(name: string): string {
  return name
    .split('-')
    .filter((word) => word !== '')
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ')
}

export function extensionCamel(name: string): string {
  const words = name.split('-').filter((word) => word !== '')
  const [head, ...rest] = words
  return `${head ?? ''}${rest
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join('')}`
}

export function extensionSnake(name: string): string {
  return name.replace(/-/g, '_')
}

export function defaultExtensionRepositoryUrl(name: string): string {
  return `https://github.com/your-name/${name}`
}

export function meithRange(version: string): string {
  const [major = '0', minor = '0'] = version.split('.')
  return `>=${major}.${minor} <${Number(major) + 1}`
}

function substitute(
  contents: string,
  values: { key: string; title: string; camel: string; snake: string; repositoryUrl: string },
): string {
  return contents
    .replaceAll('__MEITH_EXTENSION_CAMEL__', values.camel)
    .replaceAll('__MEITH_EXTENSION_SNAKE__', values.snake)
    .replaceAll('__MEITH_EXTENSION_REPOSITORY__', values.repositoryUrl)
    .replaceAll('__MEITH_EXTENSION_KEY__', values.key)
    .replaceAll('__MEITH_EXTENSION_TITLE__', values.title)
}

function extensionManifest(
  options: ExtensionScaffoldOptions,
  repositoryUrl: string,
  description: string,
  dependencies: Record<string, string>,
): string {
  return `${JSON.stringify(
    {
      name: options.name,
      version: '0.1.0',
      description,
      license: 'MIT',
      repository: { type: 'git', url: repositoryUrl },
      type: 'module',
      main: './src/index.ts',
      types: './src/index.ts',
      files: ['src', '!src/**/*.test.*'],
      scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' },
      dependencies,
      peerDependencies: { react: '^19.2.0' },
      devDependencies: {
        '@types/node': '^26.2.0',
        '@types/react': '^19.2.18',
        react: '^19.2.0',
        typescript: '^7.0.2',
        vitest: '^4.1.10',
      },
      publishConfig: { access: 'public' },
    },
    null,
    2,
  )}\n`
}

function extensionTsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'es2022',
        lib: ['es2022', 'dom'],
        module: 'esnext',
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        strict: true,
        resolveJsonModule: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ['src'],
    },
    null,
    2,
  )}\n`
}

function extensionVitestConfig(): string {
  return `import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node' },
})
`
}

function extensionGitignore(): string {
  return `node_modules
*.log
.DS_Store
`
}

function listing(
  options: ExtensionScaffoldOptions,
  kind: ExtensionKind,
  repositoryUrl: string,
  description: string,
): string {
  return `${JSON.stringify(
    {
      key: options.name,
      kind,
      package: options.name,
      name: extensionTitle(options.name),
      description,
      screenshots: [`${options.name}-light.png`],
      version: '0.1.0',
      apiVersion: 0,
      meith: meithRange(options.version),
      repository: repositoryUrl,
      licence: 'MIT',
    },
    null,
    2,
  )}\n`
}

function pluginReadme(options: ExtensionScaffoldOptions, camel: string, title: string): string {
  const { name } = options
  return `# ${title}

A Meith plugin, scaffolded by \`create-meith\` from the meith repository's
\`examples/hello-plugin\`: a footer link, a greeting on the board index, one
setting, one migration, one task and an admin page — every extension point
exercised once, each easy to delete.

## Develop

    npm install
    npm test

\`src/plugin.tsx\` is the plugin. What a plugin may and may not do is
documented in the meith repository under \`docs/customization/plugins.md\`;
every hook and payload is listed in \`docs/reference/plugin-hooks.md\`.

## Run it inside a board

Scaffold a board next to this directory if you do not have one
(\`npx create-meith my-board\`), then install this workspace into it by path:

    cd ../my-board
    npm install ../${name}

npm installs a local directory as a symlink, so edits here are picked up by
the board's next build without reinstalling.

Register the plugin in the board's \`meith.plugins.ts\` — the comment at
the top of that file shows the shape:

    import { messages as ${camel}Messages, plugin as ${camel}Plugin } from '${name}'

    export const INSTALLED_PLUGINS: readonly InstalledPlugin[] = [
      { key: '${name}', enabled: true, plugin: ${camel}Plugin, messages: ${camel}Messages },
    ]

and add the matching entry to \`board.plugins.json\`:

    { "plugins": [{ "key": "${name}", "package": "${name}", "enabled": true }] }

Rebuild the board (\`npm run build\`) and, because this plugin ships a
migration, run \`npx meith migrate\`. The plugin then appears under
**Admin → Plugins**.

## Publish and list it

\`npm publish\` ships \`src/\` as TypeScript source, the way every
\`@meith/*\` package ships. To offer the plugin on the meith.dev marketplace,
finish \`listing.json\` (its \`repository\` field starts as a placeholder),
add the screenshot it names, and open a pull request against the meith
repository — the submission process and the review bar are documented there
in \`docs/customization/marketplace.md\`.
`
}

function themeReadme(options: ExtensionScaffoldOptions, camel: string, title: string): string {
  const { name } = options
  return `# ${title}

A Meith theme, scaffolded by \`create-meith\` from the meith repository's
\`examples/iris-theme\`: the default theme recoloured (one brand group of
tokens) plus a single slot override, the footer.

## Develop

    npm install
    npm test

\`src/theme.ts\` declares the theme, \`src/tokens.ts\` carries the palette,
and slots live in \`src/slots/\`. What a theme may and may not do is
documented in the meith repository under \`docs/customization/themes.md\`;
every slot and view model is listed in \`docs/reference/theme-slots.md\`.

## Run it inside a board

Scaffold a board next to this directory if you do not have one
(\`npx create-meith my-board\`), then install this workspace into it by path:

    cd ../my-board
    npm install ../${name}

npm installs a local directory as a symlink, so edits here are picked up by
the board's next build without reinstalling.

Register the theme in the board's \`meith.config.ts\`, beside the
default entry:

    import { defaultMessages } from '@meith/theme-default'
    import { BROWSER_THEME_COLOR, DARK_TOKENS, LIGHT_TOKENS, ${camel}Theme } from '${name}'

    themes: {
      '${name}': {
        key: '${name}',
        title: '${title}',
        tokens: { light: LIGHT_TOKENS, dark: DARK_TOKENS },
        browserThemeColor: BROWSER_THEME_COLOR,
        theme: ${camel}Theme,
        messages: defaultMessages,
      },
    },

Rebuild the board (\`npm run build\`); the theme is then offered to members
on the appearance screen and to administrators under **Admin → Themes**.

## Publish and list it

\`npm publish\` ships \`src/\` as TypeScript source, the way every
\`@meith/*\` package ships. To offer the theme on the meith.dev marketplace,
finish \`listing.json\` (its \`repository\` field starts as a placeholder),
add the screenshot it names, and open a pull request against the meith
repository — the submission process and the review bar are documented there
in \`docs/customization/marketplace.md\`.
`
}

export function scaffoldPlugin(options: ExtensionScaffoldOptions): ReadonlyMap<string, string> {
  const key = options.name
  const title = extensionTitle(key)
  const camel = extensionCamel(key)
  const snake = extensionSnake(key)
  const repositoryUrl = options.repositoryUrl ?? defaultExtensionRepositoryUrl(key)
  const description = `${title} — a Meith plugin.`

  const files = new Map<string, string>()

  files.set(
    'package.json',
    extensionManifest(options, repositoryUrl, description, {
      '@meith/plugin-kit': options.version,
    }),
  )
  files.set('tsconfig.json', extensionTsconfig())
  files.set('vitest.config.ts', extensionVitestConfig())
  files.set('.gitignore', extensionGitignore())
  files.set('README.md', pluginReadme(options, camel, title))
  files.set('listing.json', listing(options, 'plugin', repositoryUrl, description))

  files.set(
    'src/index.ts',
    `export { ${camel}Plugin, ${camel}Plugin as plugin } from './plugin'
export { ${camel}Messages, ${camel}Messages as messages } from './messages'
`,
  )
  files.set(
    'src/messages/index.ts',
    `import en from './en.json'

export const ${camel}Messages = { en }
`,
  )
  files.set('src/messages/en.json', '{}\n')

  for (const template of PLUGIN_TEMPLATES) {
    files.set(
      template.path,
      substitute(template.contents, { key, title, camel, snake, repositoryUrl }),
    )
  }

  return files
}

export function scaffoldTheme(options: ExtensionScaffoldOptions): ReadonlyMap<string, string> {
  const key = options.name
  const title = extensionTitle(key)
  const camel = extensionCamel(key)
  const snake = extensionSnake(key)
  const repositoryUrl = options.repositoryUrl ?? defaultExtensionRepositoryUrl(key)
  const description = `${title} — a Meith theme.`

  const files = new Map<string, string>()

  files.set(
    'package.json',
    extensionManifest(options, repositoryUrl, description, {
      '@meith/theme-default': options.version,
      '@meith/theme-kit': options.version,
    }),
  )
  files.set('tsconfig.json', extensionTsconfig())
  files.set('vitest.config.ts', extensionVitestConfig())
  files.set('.gitignore', extensionGitignore())
  files.set('README.md', themeReadme(options, camel, title))
  files.set('listing.json', listing(options, 'theme', repositoryUrl, description))

  for (const template of THEME_TEMPLATES) {
    files.set(
      template.path,
      substitute(template.contents, { key, title, camel, snake, repositoryUrl }),
    )
  }

  return files
}

export function scaffoldExtension(
  kind: ExtensionKind,
  options: ExtensionScaffoldOptions,
): ReadonlyMap<string, string> {
  return kind === 'plugin' ? scaffoldPlugin(options) : scaffoldTheme(options)
}

export function extensionNextSteps(name: string): readonly string[] {
  return [`cd ${name}`, 'npm install', 'npm test']
}
