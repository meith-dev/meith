/**
 * Shared by every board boot smoke (scripts/board-workspace-smoke.mts,
 * scripts/board-deploy-kit-smoke.mts, scripts/board-eject-smoke.mts): proving
 * `/` renders is not proof the standalone build actually serves its own
 * assets (docs/development.md, "forum-web build stages .next/static and
 * public/ into the standalone tree"; MEI-86 shipped without either, and every
 * one of these smokes still passed on `<main>` alone). This asserts a real
 * `/_next/static/*` asset referenced from the rendered HTML answers 200, and
 * that `/sw.js` (served from `public/`) does too.
 */
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

/**
 * MEI-131: a board whose theme catalog was never registered still renders
 * `<main>`, still serves every asset, and still answers 200 — it just prints
 * `default.latestThreads.heading` where the heading belongs. Every smoke here
 * passed against exactly that board.
 *
 * The keys are read from the theme's own catalog rather than sniffed out of
 * the HTML by shape, because the shapes overlap: `community.config.ts` and
 * `meith-final.vercel.app` are dotted lowercase runs too, and a gate that
 * fails on the deployment's own hostname would be turned off within a week.
 * Matching the real key set costs a false positive only if a member writes a
 * post whose text is one of these keys exactly.
 *
 * What this detects is a catalog that was never registered, not any single
 * unresolved key: a key that only ever reaches an attribute — `aria-label`,
 * `placeholder`, `title` — is invisible here, so it is the dozens of keys a
 * dropped catalog puts in element text that make the page fail this.
 */
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

/**
 * Classes Tailwind never emits a rule for because they exist to be selected
 * against, not styled. `group` and `peer` mark an ancestor or sibling that
 * `group-hover:` and `peer-checked:` reach; the variants carry the rules.
 */
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

/**
 * A class attribute is HTML, so Tailwind's arbitrary variants reach it
 * encoded: `[&_svg]:shrink-0` is written `[&amp;_svg]:shrink-0`, and
 * `[class*='size-']` carries `&#x27;` for each quote. Comparing those bytes
 * against a stylesheet looks for a selector that could never exist, which
 * reports a correctly built board as unstyled.
 */
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

/**
 * Tailwind escapes every character a CSS selector cannot carry bare, so the
 * class `bg-destructive/5` is written `.bg-destructive\/5` and `after:absolute`
 * is `.after\:absolute`. Nothing else is transformed, which makes the selector
 * for a class computable rather than guessable.
 */
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

/**
 * MEI-131: every `@source` in globals.css names a directory of the Meith
 * repository, and a scaffolded board has none of them — its copy of that code
 * is installed under `node_modules/@meith`. Tailwind does not fail on a source
 * that resolves to nothing, so the board built green and served a stylesheet
 * with the preflight in it and almost nothing else. The page answered 200,
 * rendered `<main>`, and every asset check here passed against it.
 *
 * Asking whether the stylesheet exists is what missed that. This asks whether
 * it styles the page actually being served.
 */
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

  const unstyled = unstyledClasses(html, sheets.join('\n'))

  if (unstyled.length > 0) {
    throw new Error(
      `the board served ${hrefs.length} stylesheet(s) with no rule for ${unstyled.length} of the ` +
        `classes it rendered, so Tailwind never scanned where that markup lives: ` +
        `${unstyled.slice(0, 12).join(', ')}`,
    )
  }
}
