import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { run } from './cli'
import {
  defaultExtensionRepositoryUrl,
  extensionCamel,
  extensionNextSteps,
  extensionSnake,
  extensionTitle,
  meithRange,
  scaffoldPlugin,
  scaffoldTheme,
  validateExtensionName,
} from './scaffold-extension'

const OPTIONS = { name: 'my-tools', version: '0.21.2' }

describe('the extension name', () => {
  it('accepts a definePlugin-shaped key', () => {
    expect(validateExtensionName('my-tools')).toBeNull()
    expect(validateExtensionName('rss')).toBeNull()
    expect(validateExtensionName('a2')).toBeNull()
  })

  it.each(['', 'My-Tools', '2fast', 'a', '_x', 'a/b', `x${'y'.repeat(40)}`])(
    'refuses %o',
    (name) => {
      expect(validateExtensionName(name)).not.toBeNull()
    },
  )
})

describe('the derived spellings', () => {
  it('derives the title, identifier and table spellings from the key', () => {
    expect(extensionTitle('my-tools')).toBe('My Tools')
    expect(extensionCamel('my-tools')).toBe('myTools')
    expect(extensionSnake('my-tools')).toBe('my_tools')
  })

  it('maps the create-meith version onto a marketplace compatibility range', () => {
    expect(meithRange('0.21.2')).toBe('>=0.21 <1')
    expect(meithRange('1.4.0')).toBe('>=1.4 <2')
  })
})

describe('what the plugin scaffold writes', () => {
  const files = scaffoldPlugin(OPTIONS)

  it('writes a complete, testable workspace', () => {
    expect([...files.keys()].sort()).toEqual([
      '.gitignore',
      'README.md',
      'listing.json',
      'package.json',
      'src/index.ts',
      'src/messages/en.json',
      'src/messages/index.ts',
      'src/plugin.test.ts',
      'src/plugin.tsx',
      'tsconfig.json',
      'vitest.config.ts',
    ])
  })

  it('leaves no template token, and no trace of the example outside the README that cites it', () => {
    for (const [path, contents] of files) {
      expect(contents, path).not.toMatch(/__MEITH_EXTENSION_/)
      if (path !== 'README.md') expect(contents, path).not.toMatch(/hello/i)
    }
  })

  it('depends on the published plugin kit at the exact release version', () => {
    const manifest = JSON.parse(files.get('package.json')!)
    expect(manifest.name).toBe('my-tools')
    expect(manifest.dependencies).toEqual({ '@meith/plugin-kit': '0.21.2' })
    expect(Object.keys(manifest.devDependencies)).toContain('vitest')
  })

  it('exports the two fixed names the board manifest install path needs', () => {
    const index = files.get('src/index.ts')!
    expect(index).toContain('myToolsPlugin as plugin')
    expect(index).toContain('myToolsMessages as messages')
  })

  it('namespaces its migration table under the snake-cased key', () => {
    expect(files.get('src/plugin.tsx')).toContain('plugin_my_tools_wave')
  })

  it('declares the plugin under the scaffolded key and title', () => {
    const plugin = files.get('src/plugin.tsx')!
    expect(plugin).toContain("key: 'my-tools'")
    expect(plugin).toContain("name: 'My Tools'")
  })

  it('pre-fills a listing that matches the marketplace schema fields', () => {
    const entry = JSON.parse(files.get('listing.json')!)
    expect(entry).toEqual({
      key: 'my-tools',
      kind: 'plugin',
      package: 'my-tools',
      name: 'My Tools',
      description: 'My Tools — a Meith plugin.',
      screenshots: ['my-tools-light.png'],
      version: '0.1.0',
      apiVersion: 0,
      meith: '>=0.21 <1',
      repository: defaultExtensionRepositoryUrl('my-tools'),
      licence: 'MIT',
    })
  })

  it('points the footer link and the listing at the same repository', () => {
    const custom = scaffoldPlugin({ ...OPTIONS, repositoryUrl: 'https://github.com/me/my-tools' })
    expect(custom.get('src/plugin.tsx')).toContain('https://github.com/me/my-tools')
    expect(JSON.parse(custom.get('listing.json')!).repository).toBe(
      'https://github.com/me/my-tools',
    )
  })
})

describe('what the theme scaffold writes', () => {
  const files = scaffoldTheme({ name: 'sunset-glow', version: '0.21.2' })

  it('writes a complete, testable workspace', () => {
    expect([...files.keys()].sort()).toEqual([
      '.gitignore',
      'README.md',
      'listing.json',
      'package.json',
      'src/index.ts',
      'src/slots/footer.tsx',
      'src/theme.test.ts',
      'src/theme.ts',
      'src/tokens.ts',
      'tsconfig.json',
      'vitest.config.ts',
    ])
  })

  it('leaves no template token, and no trace of the example outside the README that cites it', () => {
    for (const [path, contents] of files) {
      expect(contents, path).not.toMatch(/__MEITH_EXTENSION_/)
      if (path !== 'README.md') expect(contents, path).not.toMatch(/iris/i)
    }
  })

  it('depends on the published theme kit and default theme at the exact release version', () => {
    const manifest = JSON.parse(files.get('package.json')!)
    expect(manifest.dependencies).toEqual({
      '@meith/theme-default': '0.21.2',
      '@meith/theme-kit': '0.21.2',
    })
  })

  it('declares the theme under the scaffolded key, extending the default theme', () => {
    const theme = files.get('src/theme.ts')!
    expect(theme).toContain("key: 'sunset-glow'")
    expect(theme).toContain("title: 'Sunset Glow'")
    expect(theme).toContain('extends: defaultTheme')
    expect(files.get('src/index.ts')).toContain('sunsetGlowTheme')
  })

  it('pre-fills a theme listing', () => {
    const entry = JSON.parse(files.get('listing.json')!)
    expect(entry.kind).toBe('theme')
    expect(entry.key).toBe('sunset-glow')
    expect(entry.package).toBe('sunset-glow')
  })
})

describe('the CLI, in extension mode', () => {
  async function inTemp<T>(body: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), 'create-meith-ext-'))
    const previous = process.cwd()
    process.chdir(dir)
    try {
      return await body(dir)
    } finally {
      process.chdir(previous)
    }
  }

  it('mentions both extension forms in --help', async () => {
    const result = await run(['--help'], '1.0.0')
    expect(result.code).toBe(0)
    expect(result.lines.join('\n')).toContain('--plugin <name>')
    expect(result.lines.join('\n')).toContain('--theme <name>')
  })

  it('refuses --plugin and --theme together', async () => {
    const result = await run(['--plugin', '--theme', 'x'], '1.0.0')
    expect(result.code).toBe(1)
    expect(result.lines[0]).toMatch(/pass one/)
  })

  it('holds an extension name to the definePlugin key rules', async () => {
    const result = await run(['--plugin', 'My-Tools'], '1.0.0')
    expect(result.code).toBe(1)
    expect(result.lines.join('\n')).toContain('Usage: npx create-meith --plugin <name>')
  })

  it('writes a plugin workspace and says what to run next', async () => {
    await inTemp(async (dir) => {
      const result = await run(['--plugin', 'my-tools', '--no-git'], '0.21.2')
      expect(result.code).toBe(0)
      expect(result.lines.join('\n')).toContain('cd my-tools')
      expect(result.lines.join('\n')).toContain('npm test')

      const manifest = JSON.parse(await readFile(join(dir, 'my-tools/package.json'), 'utf8'))
      expect(manifest.dependencies['@meith/plugin-kit']).toBe('0.21.2')
    })
  })

  it('writes a theme workspace under --theme', async () => {
    await inTemp(async (dir) => {
      const result = await run(['--theme', 'sunset-glow', '--no-git'], '0.21.2')
      expect(result.code).toBe(0)
      const theme = await readFile(join(dir, 'sunset-glow/src/theme.ts'), 'utf8')
      expect(theme).toContain("key: 'sunset-glow'")
    })
  })

  it('tells the author the three commands that prove the workspace runs', () => {
    expect(extensionNextSteps('my-tools')).toEqual(['cd my-tools', 'npm install', 'npm test'])
  })
})
