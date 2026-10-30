import { expect, it } from 'vitest'

import { extractAttachmentIds } from './attachment-ids'

it('collects attachment references from nested blocks and deduplicates them', () => {
  expect(
    extractAttachmentIds(
      '[attachment=1]\n\n> **[attachment=2]**\n\n- [attachment=3]\n\n[attachment=1]',
    ),
  ).toEqual([1, 2, 3])
})

it('ignores escaped markers and examples in inline or fenced code', () => {
  expect(
    extractAttachmentIds(
      '\\[attachment=1] `[attachment=2]`\n\n```\n[attachment=3]\n```\n\n[attachment=4]',
    ),
  ).toEqual([4])
})
