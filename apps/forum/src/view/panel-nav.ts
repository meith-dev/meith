export interface PanelSubsection {
  readonly href: string
  readonly title: string
}

export interface PanelSection {
  readonly href: string
  readonly title: string
  readonly blurb: string
  readonly children?: readonly PanelSubsection[]
}

export type PanelNav = readonly PanelSection[]

export function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function longest(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null
  for (const href of hrefs) {
    if (!isUnder(pathname, href)) continue
    if (best === null || href.length > best.length) best = href
  }
  return best
}

export function sectionHrefIn(nav: PanelNav, pathname: string): string | null {
  return longest(
    pathname,
    nav.map((section) => section.href),
  )
}

export function deepestHrefIn(nav: PanelNav, pathname: string): string | null {
  return longest(
    pathname,
    nav.flatMap((section) => [
      section.href,
      ...(section.children ?? []).map((child) => child.href),
    ]),
  )
}

export function flattenNav(nav: PanelNav): readonly (PanelSection | PanelSubsection)[] {
  return nav.flatMap((section) => [section, ...(section.children ?? [])])
}

export function currentProps(
  pathname: string,
  href: string,
  deepest: string | null,
): { readonly 'aria-current'?: 'page' | 'true' } {
  if (href !== deepest) return {}
  return { 'aria-current': pathname === href ? 'page' : 'true' }
}
