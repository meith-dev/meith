import { describe, expect, it } from 'vitest'

import { forumNotice } from './forum-notice'

describe('the notice a forum page renders after an action', () => {
  it('confirms a thread deletion, which redirects here with ?thread=deleted', () => {
    const notice = forumNotice({ thread: 'deleted' })

    expect(notice).not.toBeNull()
    expect(notice).toContain('deleted')
    expect(notice).toContain('restore')
  })

  it('still says a new thread is held for approval', () => {
    expect(forumNotice({ posted: 'moderated' })).toContain('waiting for a moderator')
  })

  it('still reports an inline moderation batch', () => {
    expect(forumNotice({ did: 'lock', n: '3' })).toBe('3 items locked.')
  })

  it('says nothing when the page was not reached from an action', () => {
    expect(forumNotice({})).toBeNull()
    expect(forumNotice({ thread: 'something-else' })).toBeNull()
  })
})
