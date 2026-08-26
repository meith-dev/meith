#!/usr/bin/env -S npx tsx
import { spawnSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { packClosure } from './pack-workspace-closure.mts'
import { ROOT } from './workspace-packages.mjs'

function run(
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
) {
  console.log(`$ ${command} ${args.join(' ')}  (in ${options.cwd})`)
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: 'inherit',
    env: options.env ?? process.env,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? result.signal}`)
  }
}

const CLOSURE_ROOTS = [
  '@meith/web',
  '@meith/cli',
  '@meith/theme-default',
  '@meith/plugin-kit',
  '@meith/theme-kit',
]

async function scaffold(parentDir: string, argv: readonly string[], name: string): Promise<string> {
  const { run: runCreateMeith } = await import(join(ROOT, 'packages/create-meith/src/cli.ts'))
  const previousCwd = process.cwd()
  process.chdir(parentDir)
  try {
    const result = await runCreateMeith(argv, '0.0.0-smoke')
    if (result.code !== 0) {
      throw new Error(`create-meith failed:\n${result.lines.join('\n')}`)
    }
  } finally {
    process.chdir(previousCwd)
  }
  return join(parentDir, name)
}

async function pointAtTarballs(dir: string, tarballs: ReadonlyMap<string, string>) {
  const packageJsonPath = join(dir, 'package.json')
  const manifest = JSON.parse(await readFile(packageJsonPath, 'utf8'))

  const overrides: Record<string, string> = {}
  for (const [name, tarball] of tarballs) {
    const fileSpecifier = `file:${tarball}`
    if (name in (manifest.dependencies ?? {})) {
      manifest.dependencies[name] = fileSpecifier
    }
    overrides[name] = fileSpecifier
  }
  manifest.overrides = overrides

  await writeFile(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

function replaceOnce(source: string, file: string, from: string, to: string): string {
  if (!source.includes(from)) {
    throw new Error(
      `extension-workspace-smoke: ${file} does not contain the expected anchor:\n${from}\n` +
        'The scaffold changed shape — update this smoke to follow it.',
    )
  }
  return source.replace(from, to)
}

async function editFile(dir: string, file: string, edit: (source: string) => string) {
  const path = join(dir, file)
  await writeFile(path, edit(await readFile(path, 'utf8')), 'utf8')
}

async function registerPlugin(boardDir: string) {
  await editFile(
    boardDir,
    'board.plugins.json',
    () =>
      `${JSON.stringify(
        { plugins: [{ key: 'smoke-plugin', package: 'smoke-plugin', enabled: true }] },
        null,
        2,
      )}\n`,
  )
  await editFile(boardDir, 'community.plugins.ts', (source) =>
    replaceOnce(
      source,
      'community.plugins.ts',
      'export const INSTALLED_PLUGINS: readonly InstalledPlugin[] = []',
      "import { messages as smokePluginMessages, plugin as smokePluginPlugin } from 'smoke-plugin'\n\n" +
        'export const INSTALLED_PLUGINS: readonly InstalledPlugin[] = [\n' +
        "  { key: 'smoke-plugin', enabled: true, plugin: smokePluginPlugin, messages: smokePluginMessages },\n" +
        ']',
    ),
  )
}

async function registerTheme(boardDir: string) {
  await editFile(boardDir, 'community.config.ts', (source) => {
    const withImport = replaceOnce(
      source,
      'community.config.ts',
      "import { INSTALLED_PLUGINS } from './community.plugins'",
      'import {\n' +
        '  BROWSER_THEME_COLOR as smokeThemeColor,\n' +
        '  DARK_TOKENS as smokeThemeDark,\n' +
        '  LIGHT_TOKENS as smokeThemeLight,\n' +
        '  smokeThemeTheme,\n' +
        "} from 'smoke-theme'\n\n" +
        "import { INSTALLED_PLUGINS } from './community.plugins'",
    )
    return replaceOnce(
      withImport,
      'community.config.ts',
      "  },\n  defaultTheme: 'default',",
      '    ' +
        "'smoke-theme': {\n" +
        "      key: 'smoke-theme',\n" +
        "      title: 'Smoke Theme',\n" +
        '      tokens: { light: smokeThemeLight, dark: smokeThemeDark },\n' +
        '      browserThemeColor: smokeThemeColor,\n' +
        '      theme: smokeThemeTheme,\n' +
        '      messages: defaultMessages,\n' +
        '    },\n' +
        "  },\n  defaultTheme: 'default',",
    )
  })
}

async function packExtension(dir: string): Promise<string> {
  run('npm', ['pack'], { cwd: dir })
  const tarball = (await readdir(dir)).find((entry) => entry.endsWith('.tgz'))
  if (tarball === undefined) {
    throw new Error(`extension-workspace-smoke: npm pack left no tarball in ${dir}`)
  }
  return join(dir, tarball)
}

async function main() {
  const tarballDir = await mkdtemp(join(tmpdir(), 'extension-smoke-tarballs-'))
  const parentDir = await mkdtemp(join(tmpdir(), 'extension-smoke-'))

  try {
    console.log('== packing the workspace closure ==')
    const tarballs = await packClosure(tarballDir, CLOSURE_ROOTS)
    console.log(`packed ${tarballs.size} packages`)

    console.log('== scaffolding a plugin and a theme with create-meith ==')
    const pluginDir = await scaffold(parentDir, ['--plugin', 'smoke-plugin'], 'smoke-plugin')
    const themeDir = await scaffold(parentDir, ['--theme', 'smoke-theme'], 'smoke-theme')

    console.log('== packing both extensions the way npm publish would ==')
    const pluginTarball = await packExtension(pluginDir)
    const themeTarball = await packExtension(themeDir)

    for (const dir of [pluginDir, themeDir]) {
      console.log(`== ${dir}: install, test and typecheck against the packed kits ==`)
      await pointAtTarballs(dir, tarballs)
      run('npm', ['install'], { cwd: dir })
      run('npm', ['test'], { cwd: dir })
      run('npm', ['run', 'typecheck'], { cwd: dir })
    }

    console.log('== scaffolding a board and installing both extensions into it ==')
    const boardDir = await scaffold(parentDir, ['smoke-board'], 'smoke-board')
    await pointAtTarballs(boardDir, tarballs)
    run('npm', ['install'], { cwd: boardDir })
    run('npm', ['install', pluginTarball, themeTarball], { cwd: boardDir })

    console.log('== registering the plugin and the theme ==')
    await registerPlugin(boardDir)
    await registerTheme(boardDir)

    console.log('== forum-web build (fixture mode) with both extensions registered ==')
    run(join(boardDir, 'node_modules/.bin/forum-web'), ['build'], {
      cwd: boardDir,
      env: { ...process.env, DATABASE_URL: '', DATA_SOURCE: '' },
    })

    console.log('✓ extension-workspace-smoke: scaffolded plugin and theme install, test and')
    console.log('  typecheck against the packed kits, and a scaffolded board builds with both')
    console.log('  installed from their own packed tarballs and registered.')
  } catch (error) {
    console.error(`✗ extension-workspace-smoke: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  } finally {
    await rm(tarballDir, { recursive: true, force: true })
    await rm(parentDir, { recursive: true, force: true })
  }
}

await main()
