import type { Translator } from '@meith/i18n'
import type {
  PanelKind,
  PanelNavCurrent,
  PanelNavIcon,
  PanelNavModel,
  PanelNavSectionModel,
} from '@meith/theme-kit'

import { untranslated } from './time'

export interface PanelSubsection {
  readonly href: string
  readonly titleKey?: string
  readonly titleText?: string
  readonly record?: boolean
}

export interface PanelSection {
  readonly href: string
  readonly titleKey?: string
  readonly titleText?: string
  readonly blurbKey?: string
  readonly blurbText?: string
  readonly icon?: PanelNavIcon
  readonly children?: readonly PanelSubsection[]
}

export function panelText(
  t: Translator,
  entry: { readonly titleKey?: string; readonly titleText?: string },
): string
export function panelText(
  t: Translator,
  entry: { readonly blurbKey?: string; readonly blurbText?: string },
  field: 'blurb',
): string
export function panelText(
  t: Translator,
  entry: Readonly<Record<string, string | undefined>>,
  field: 'title' | 'blurb' = 'title',
): string {
  const text = entry[`${field}Text`]
  if (text !== undefined) return text

  const key = entry[`${field}Key`]
  return key === undefined ? '' : t.t(key)
}

export interface PanelSectionCopy {
  readonly href: string
  readonly title: string
  readonly blurb: string
}

export function panelSectionCopy(nav: PanelNav, t: Translator): readonly PanelSectionCopy[] {
  return nav.map((section) => ({
    href: section.href,
    title: panelText(t, section),
    blurb: panelText(t, section, 'blurb'),
  }))
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
  return (section.children ?? []).filter((child) => child.record !== true || child.href === deepest)
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

function currentFor(
  location: string,
  href: string,
  deepest: string | null,
): PanelNavCurrent | null {
  if (href !== deepest) return null
  return isHere(location, href) ? 'here' : 'under'
}

export function buildPanelNavModel(input: {
  readonly panel: PanelKind
  readonly nav: PanelNav
  readonly overviewHref: string
  readonly location: string
  readonly fallbackHref?: string | undefined
  readonly counts?: PanelCounts | undefined
  readonly label?: string
  readonly t?: Translator | undefined
}): PanelNavModel {
  const t = input.t ?? untranslated()
  const fallback = input.fallbackHref ?? null
  const open = sectionHrefIn(input.nav, input.location) ?? fallback
  const deepest = deepestHrefIn(input.nav, input.location) ?? fallback

  const sections: PanelNavSectionModel[] = input.nav.map((section) => {
    const isOpen = open === section.href

    return {
      href: section.href,
      title: panelText(t, section),
      icon: section.icon ?? null,
      count: countFor(input.counts, section.href),
      current: currentFor(input.location, section.href, deepest),
      isRecord: false,
      isOpen,
      isOverview: section.href === input.overviewHref,
      children: isOpen
        ? visibleChildren(section, deepest).map((child) => ({
            href: child.href,
            title: panelText(t, child),
            icon: null,
            count: countFor(input.counts, child.href),
            current: currentFor(input.location, child.href, deepest),
            isRecord: child.record === true,
          }))
        : [],
    }
  })

  const here = flattenNav(input.nav).find((item) => item.href === deepest)

  return {
    panel: input.panel,
    label: input.label ?? t.t('panel.sections'),
    sections,
    currentTitle: here === undefined ? null : panelText(t, here),
  }
}
