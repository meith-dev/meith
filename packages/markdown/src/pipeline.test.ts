import { describe, expect, it } from 'vitest'

import { CORE_RENDERING, type MarkdownPipeline, renderThrough } from './pipeline'

const CONTEXT = { source: 'post', viewer: { userId: 3, isGuest: false } } as const

const LOUD: MarkdownPipeline = {
  text: async (text) => text.replaceAll('[[name]]', 'Ada'),
  html: async (html) => `${html}<footer>rendered</footer>`,
  vocabulary: async (source) => source,
}

describe('renderThrough', () => {
  it('renders exactly as the core renderer does when nothing is registered', async () => {
    const rendered = await renderThrough(CORE_RENDERING, 'Hello **world**', CONTEXT)

    expect(rendered.html).toContain('<strong>world</strong>')
    expect(rendered.truncated).toBe(false)
  })

  it('rewrites the source before the parser sees it', async () => {
    const rendered = await renderThrough(LOUD, 'Hello [[name]]', CONTEXT)

    expect(rendered.html).toContain('Hello Ada')
    expect(rendered.html).not.toContain('[[name]]')
  })

  it('hands the constructed HTML on, and nothing escapes what comes back', async () => {
    const rendered = await renderThrough(LOUD, 'Hello', CONTEXT)

    expect(rendered.html.endsWith('<footer>rendered</footer>')).toBe(true)
  })

  it('keeps the version the core renderer stamped', async () => {
    const core = await renderThrough(CORE_RENDERING, 'Hello', CONTEXT)
    const filtered = await renderThrough(LOUD, 'Hello', CONTEXT)

    expect(filtered.version).toBe(core.version)
  })
})
