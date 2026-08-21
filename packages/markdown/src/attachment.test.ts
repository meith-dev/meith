import { describe, expect, it } from 'vitest'

import { renderMarkdown } from './body'
import { SIGNATURE_FEATURES } from './features'

const html = (source: string): string => renderMarkdown(source).html
const inline = (source: string): string => html(source).replace(/^<p>|<\/p>$/g, '')

describe('inline attachment syntax', () => {
  it('becomes a placeholder span naming the id, on its own', () => {
    expect(inline('[attachment=42]')).toBe(
      '<span class="md-attachment" data-attachment-id="42"></span>',
    )
  })

  it('sits inline with the rest of the sentence, like an image would', () => {
    expect(inline('see [attachment=1] for the screenshot')).toBe(
      'see <span class="md-attachment" data-attachment-id="1"></span> for the screenshot',
    )
  })

  it('is never a permission decision at this layer — the id is all it carries', () => {
    // Whether *this* viewer may actually see attachment 42 is answered later,
    // by the post-processing step with database and viewer context. Nothing
    // here should be mistaken for that check having already happened.
    expect(inline('[attachment=42]')).not.toContain('href')
  })

  it('is off wherever attachments generally are not, such as a signature', () => {
    const out = renderMarkdown('[attachment=1]', { features: SIGNATURE_FEATURES }).html
    expect(out).not.toContain('md-attachment')
    expect(out).toContain('[attachment=1]')
  })

  it('does not fire on an id that is not entirely digits', () => {
    expect(inline('[attachment=1a]')).toBe('[attachment=1a]')
  })

  it('does not fire without the id, however tempting the name alone looks', () => {
    expect(inline('[attachment]')).toBe('[attachment]')
  })

  it('takes only its own brackets, leaving what follows as ordinary text', () => {
    // [attachment=1] is not link syntax, so trailing (…) is not a destination —
    // it is read as the literal characters that come after the placeholder.
    expect(inline('[attachment=1](not a destination)')).toBe(
      '<span class="md-attachment" data-attachment-id="1"></span>(not a destination)',
    )
  })
})
