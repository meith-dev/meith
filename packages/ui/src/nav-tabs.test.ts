import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { NavTabs } from './nav-tabs'

describe('NavTabs', () => {
  it('renders native navigation with one current page and meaningful counts', () => {
    const html = renderToStaticMarkup(
      createElement(NavTabs, {
        label: 'Conversations',
        tabs: [
          { href: '/new', label: 'New', isCurrent: true, count: 3 },
          { href: '/read', label: 'Read', isCurrent: false, count: 0 },
        ],
        aside: 'Updated today',
      }),
    )

    expect(html).toContain('aria-label="Conversations"')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toContain('href="/new"')
    expect(html).toContain('href="/read"')
    expect(html).toContain('>3</span>')
    expect(html).not.toContain('>0</span>')
    expect(html).toContain('Updated today')
    expect(html).not.toContain('role="tab"')
  })

  it('omits an empty navigation landmark', () => {
    expect(renderToStaticMarkup(createElement(NavTabs, { label: 'Empty', tabs: [] }))).toBe('')
  })
})
