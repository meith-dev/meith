export interface PanelSubsection {
  readonly href: string
  readonly title: string
  readonly record?: boolean
}

export interface PanelSection {
  readonly href: string
  readonly title: string
  readonly blurb: string
  readonly children?: readonly PanelSubsection[]
}

export type PanelNav = readonly PanelSection[]

function parts(href: string): { path: string; params: URLSearchParams } {
  const cut = href.indexOf('?')
  if (cut === -1) return { path: href, params: new URLSearchParams() }
  return { path: href.slice(0, cut), params: new URLSearchParams(href.slice(cut + 1)) }
}

function paramsAgree(here: URLSearchParams, wanted: URLSearchParams): boolean {
  for (const [key, value] of wanted) {
    if (here.get(key) !== value) return false
  }
  return true
}

export function isUnder(location: string, href: string): boolean {
  const here = parts(location)
  const want = parts(href)
  if (here.path !== want.path && !here.path.startsWith(`${want.path}/`)) return false
  return paramsAgree(here.params, want.params)
}

export function isHere(location: string, href: string): boolean {
  const here = parts(location)
  const want = parts(href)
  return here.path === want.path && paramsAgree(here.params, want.params)
}

function longest(location: string, hrefs: readonly string[]): string | null {
  let best: string | null = null
  for (const href of hrefs) {
    if (!isUnder(location, href)) continue
    if (best === null || href.length > best.length) best = href
  }
  return best
}

export function sectionHrefIn(nav: PanelNav, location: string): string | null {
  return longest(
    location,
    nav.map((section) => section.href),
  )
}

export function deepestHrefIn(nav: PanelNav, location: string): string | null {
  return longest(
    location,
    nav.flatMap((section) => [
      section.href,
      ...(section.children ?? []).map((child) => child.href),
    ]),
  )
}

export function flattenNav(nav: PanelNav): readonly (PanelSection | PanelSubsection)[] {
  return nav.flatMap((section) => [section, ...(section.children ?? [])])
}

export function visibleChildren(
  section: PanelSection,
  deepest: string | null,
): readonly PanelSubsection[] {
  return (section.children ?? []).filter(
    (child) => child.record !== true || child.href === deepest,
  )
}

export type PanelCounts = Readonly<Record<string, number>>

export function countFor(counts: PanelCounts | undefined, href: string): number | null {
  const count = counts?.[href] ?? 0
  return count > 0 ? count : null
}

export function currentProps(
  location: string,
  href: string,
  deepest: string | null,
): { readonly 'aria-current'?: 'page' | 'true' } {
  if (href !== deepest) return {}
  return { 'aria-current': isHere(location, href) ? 'page' : 'true' }
}
