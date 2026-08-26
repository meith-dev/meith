const ASSET_HREF = /(?:href|src)="(\/_next\/static\/[^"]+)"/

export async function assertBoardAssetsServe(baseUrl: string, html: string): Promise<void> {
  const match = ASSET_HREF.exec(html)
  if (match === null) {
    throw new Error(
      `board-smoke: no /_next/static/* asset reference found in the rendered HTML from ${baseUrl}/`,
    )
  }
  const assetUrl = `${baseUrl}${match[1]}`
  const assetResponse = await fetch(assetUrl)
  if (!assetResponse.ok) {
    throw new Error(`board-smoke: ${assetUrl} answered ${assetResponse.status}`)
  }

  const swUrl = `${baseUrl}/sw.js`
  const swResponse = await fetch(swUrl)
  if (!swResponse.ok) {
    throw new Error(`board-smoke: ${swUrl} answered ${swResponse.status}`)
  }
}

export function unresolvedMessageKeys(html: string, keys: Iterable<string>): string[] {
  const found = new Set<string>()

  for (const key of keys) {
    if (html.includes(`>${key}<`)) found.add(key)
  }

  return [...found].sort()
}

export function assertMessagesResolve(html: string, keys: Iterable<string>): void {
  const unresolved = unresolvedMessageKeys(html, keys)

  if (unresolved.length > 0) {
    throw new Error(
      `the board rendered ${unresolved.length} message key(s) instead of their text, so a catalog is not registered: ${unresolved.slice(0, 8).join(', ')}`,
    )
  }
}

const CLASS_ATTRIBUTE = /\sclass="([^"]*)"/g

const MARKER_CLASSES = new Set(['group', 'peer', 'dark', 'light'])

function isMarker(className: string): boolean {
  const [head] = className.split('/')
  return head !== undefined && MARKER_CLASSES.has(head)
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16))
    }
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10))
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity
  })
}

export function classesInMarkup(html: string): string[] {
  const found = new Set<string>()

  for (const match of html.matchAll(CLASS_ATTRIBUTE)) {
    for (const className of decodeEntities(match[1] ?? '').split(/\s+/)) {
      if (className !== '' && !isMarker(className)) found.add(className)
    }
  }

  return [...found].sort()
}

function selectorFor(className: string): string {
  return `.${className.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`)}`
}

function isDefined(css: string, className: string): boolean {
  const selector = selectorFor(className)

  for (let at = css.indexOf(selector); at !== -1; at = css.indexOf(selector, at + 1)) {
    const next = css[at + selector.length]
    if (next === undefined || !/[a-zA-Z0-9_\\-]/.test(next)) return true
  }

  return false
}

export function unstyledClasses(html: string, css: string): string[] {
  return classesInMarkup(html).filter((className) => !isDefined(css, className))
}

export const PACKAGE_WITNESS_CLASSES = [
  'border-l-moderation-pending',
  'border-l-moderation-approved',
  'border-group-supermod/30',
  'bg-thread-pinned/10',
  'bg-post-unapproved/40',
] as const

export async function assertStylesResolve(baseUrl: string, html: string): Promise<void> {
  const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(
    (match) => match[1] ?? '',
  )

  if (hrefs.length === 0) {
    throw new Error(`board-smoke: ${baseUrl}/ referenced no stylesheet at all`)
  }

  const sheets = await Promise.all(
    hrefs.map(async (href) => {
      const url = href.startsWith('http') ? href : `${baseUrl}${href}`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`board-smoke: ${url} answered ${response.status}`)
      return response.text()
    }),
  )

  const css = sheets.join('\n')
  const missing = PACKAGE_WITNESS_CLASSES.filter((className) => !isDefined(css, className))

  if (missing.length > 0) {
    const unstyled = unstyledClasses(html, css)
    throw new Error(
      `the board served ${hrefs.length} stylesheet(s) with no rule for ${missing.length} of the ` +
        `classes only its installed packages produce, so Tailwind never scanned them: ` +
        `${missing.join(', ')}. ${unstyled.length} of the classes the page rendered are ` +
        `unstyled, starting with: ${unstyled.slice(0, 12).join(', ')}`,
    )
  }
}
