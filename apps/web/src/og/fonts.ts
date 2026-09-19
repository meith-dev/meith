import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface OgFont {
  readonly name: string
  readonly data: Buffer
  readonly weight: 400 | 600
  readonly style: 'normal' | 'italic'
}

const BASES = [join(process.cwd(), 'node_modules'), join(process.cwd(), '..', '..', 'node_modules')]

function fontFile(pkg: string, file: string): string {
  for (const base of BASES) {
    const candidate = join(base, '@fontsource', pkg, 'files', file)
    if (existsSync(candidate)) return candidate
  }
  return join(BASES[0] as string, '@fontsource', pkg, 'files', file)
}

let cache: Promise<OgFont[]> | undefined

export function ogFonts(): Promise<OgFont[]> {
  if (cache === undefined) {
    cache = Promise.all([
      readFile(fontFile('inter', 'inter-latin-400-normal.woff')),
      readFile(fontFile('inter', 'inter-latin-600-normal.woff')),
      readFile(fontFile('lora', 'lora-latin-400-italic.woff')),
    ]).then(([regular, semibold, serifItalic]) => [
      { name: 'Inter', data: regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: semibold, weight: 600, style: 'normal' },
      { name: 'Lora', data: serifItalic, weight: 400, style: 'italic' },
    ])
  }
  return cache
}
