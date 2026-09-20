import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import { site } from '../content/site'
import { ThemeShowcase } from './theme-showcase'

it('renders the real theme layouts with safe sample links and native preview controls', () => {
  const html = renderToStaticMarkup(createElement(ThemeShowcase))
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
  const targets = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1])
  const hrefs = [...html.matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1])

  expect(new Set(ids).size).toBe(ids.length)
  expect(targets).toEqual([
    'board-default',
    'board-clubhouse',
    'board-phasebook',
    'board-raidframe',
    'board-midnight',
  ])
  for (const target of targets) expect(ids).toContain(target)
  expect(html.match(/<input[^>]+name="preview-theme"/g)).toHaveLength(5)
  expect(html.match(/<input[^>]+name="preview-scheme"/g)).toHaveLength(2)
  expect(html.match(/ checked=""/g)).toHaveLength(2)
  expect(html.match(/data-slot="card-rows"/g)).toHaveLength(2)
  expect(html.match(/<table\b/g)).toHaveLength(2)
  expect(html.match(/General discussions/g)).toHaveLength(5)
  expect(new Set(hrefs)).toEqual(new Set([site.demo]))
  expect(html).not.toMatch(/<(img|iframe|script|form)\b/)
})
