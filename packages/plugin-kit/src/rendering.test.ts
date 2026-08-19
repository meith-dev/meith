import { describe, expect, it } from 'vitest'

import { definePlugin } from './plugin'
import { renderingSignature, rendersStoredContent } from './rendering'

const plain = definePlugin({
  key: 'plain',
  name: 'Plain',
  version: '1.0.0',
  apiVersion: '0',
  hooks: { 'view.footer': (value) => value },
})

const formatter = definePlugin({
  key: 'formatter',
  name: 'Formatter',
  version: '1.0.0',
  apiVersion: '0',
  hooks: { 'markdown.render.html': (value) => value },
})

const upgraded = definePlugin({ ...formatter, version: '1.1.0' })

describe('rendersStoredContent', () => {
  it('is true only of a plugin that shapes what is stored', () => {
    expect(rendersStoredContent(formatter)).toBe(true)
    expect(rendersStoredContent(plain)).toBe(false)
  })
})

describe('renderingSignature', () => {
  it('ignores a plugin that cannot change a stored render', () => {
    expect(renderingSignature([formatter, plain])).toBe(renderingSignature([formatter]))
  })

  it('does not depend on the order plugins are listed in', () => {
    expect(renderingSignature([formatter, plain])).toBe(renderingSignature([plain, formatter]))
  })

  it('changes when a formatting plugin arrives, leaves, or is upgraded', () => {
    expect(renderingSignature([])).not.toBe(renderingSignature([formatter]))
    expect(renderingSignature([formatter])).not.toBe(renderingSignature([upgraded]))
  })

  it('stays inside a positive 32-bit integer, because it is stored as one', () => {
    for (const plugins of [[], [formatter], [formatter, upgraded]]) {
      const signature = renderingSignature(plugins)
      expect(Number.isSafeInteger(signature)).toBe(true)
      expect(signature).toBeGreaterThan(0)
      expect(signature).toBeLessThanOrEqual(2_147_483_647)
    }
  })
})
