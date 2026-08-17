import { describe, expect, it } from 'vitest'

import { DEMO_ACCOUNTS } from './accounts'
import {
  DEMO_FORUMS,
  DEMO_MESSAGES,
  DEMO_PREFIXES,
  DEMO_REPORTS,
  DEMO_THANKS,
  DEMO_THREADS,
} from './content'

/**
 * The content is hand-written, which is what makes it worth reading and also
 * what makes it possible to write a post by a member who had not joined yet.
 * Everything here is a mistake a person makes and a database does not catch:
 * the seed would happily write a reply dated before its author registered, and
 * a visitor would find it on the member's profile.
 */

const ACCOUNT = new Map(DEMO_ACCOUNTS.map((account) => [account.key, account]))
const FORUM = new Map(DEMO_FORUMS.map((forum) => [forum.key, forum]))
const PREFIX = new Set(DEMO_PREFIXES.map((prefix) => prefix.key))

interface Post {
  readonly thread: string
  readonly author: string
  readonly daysAgo: number
}

function posts(): readonly Post[] {
  return DEMO_THREADS.flatMap((thread) => [
    { thread: thread.title, author: thread.author, daysAgo: thread.daysAgo },
    ...(thread.replies ?? []).map((reply) => ({
      thread: thread.title,
      author: reply.author,
      daysAgo: thread.daysAgo - reply.hoursAfter / 24,
    })),
  ])
}

describe('the written content', () => {
  it('is a board rather than a handful of threads', () => {
    expect(DEMO_THREADS.length).toBeGreaterThanOrEqual(60)
    expect(posts().length).toBeGreaterThanOrEqual(300)
    expect(DEMO_ACCOUNTS.length).toBeGreaterThanOrEqual(40)
  })

  it('puts every thread in a forum that exists and accepts threads', () => {
    for (const thread of DEMO_THREADS) {
      const forum = FORUM.get(thread.forum)
      expect(forum, `"${thread.title}" is in "${thread.forum}"`).toBeDefined()
      expect(forum!.type, `"${thread.title}" is in a category`).toBe('forum')
    }
  })

  it('names a prefix that exists, in a forum the prefix is scoped to', () => {
    for (const thread of DEMO_THREADS) {
      if (thread.prefix === undefined) continue
      expect(PREFIX.has(thread.prefix), `"${thread.title}" uses "${thread.prefix}"`).toBe(true)

      const prefix = DEMO_PREFIXES.find((candidate) => candidate.key === thread.prefix)!
      if (prefix.scope === null) continue

      const branch = new Set<string>([prefix.scope])
      for (const forum of DEMO_FORUMS) {
        if (forum.parent !== null && branch.has(forum.parent)) branch.add(forum.key)
      }
      expect(branch.has(thread.forum), `"${thread.title}" is outside "${prefix.key}"`).toBe(true)
    }
  })

  it('opens with the two restricted sections, staff first', () => {
    const sections = DEMO_FORUMS.filter((forum) => forum.type === 'category')
    expect(sections[0]?.access, 'the first section is not the staff one').toBe('staff')
    expect(sections[1]?.access, 'the second section is not the supporters one').toBe('supporters')
    expect(
      sections.slice(2).every((section) => section.access === undefined),
      'a restricted section is buried under the open ones',
    ).toBe(true)
  })

  it('marks every forum in a restricted section, rather than relying on the category', () => {
    for (const forum of DEMO_FORUMS) {
      if (forum.parent === null) continue
      const parent = FORUM.get(forum.parent)!
      expect(forum.access, `${forum.title} does not match ${parent.title}`).toBe(parent.access)
    }

    for (const access of ['staff', 'supporters'] as const) {
      const forums = DEMO_FORUMS.filter(
        (forum) => forum.access === access && forum.type === 'forum',
      )
      expect(forums.length, `the ${access} section is one forum`).toBeGreaterThan(1)
    }
  })

  it('gives every forum something to show and every category a forum', () => {
    for (const forum of DEMO_FORUMS) {
      const count =
        forum.type === 'forum'
          ? DEMO_THREADS.filter((thread) => thread.forum === forum.key).length
          : DEMO_FORUMS.filter((child) => child.parent === forum.key).length
      expect(count, `${forum.title} is empty`).toBeGreaterThan(0)
    }
  })

  it('never posts as somebody who had not joined yet', () => {
    for (const post of posts()) {
      const account = ACCOUNT.get(post.author)
      expect(account, `"${post.thread}" is written by "${post.author}"`).toBeDefined()
      expect(
        account!.joinedDaysAgo,
        `${account!.username} posts in "${post.thread}" before joining`,
      ).toBeGreaterThanOrEqual(post.daysAgo)
    }
  })

  it('keeps replies in the order they were written', () => {
    for (const thread of DEMO_THREADS) {
      const hours = (thread.replies ?? []).map((reply) => reply.hoursAfter)
      expect(
        [...hours].sort((a, b) => a - b),
        `"${thread.title}" replies`,
      ).toEqual(hours)
      expect(
        hours.every((hour) => hour > 0),
        `"${thread.title}" has a reply at zero`,
      ).toBe(true)
    }
  })

  it('quotes a post that is above the quoting one', () => {
    for (const thread of DEMO_THREADS) {
      for (const [index, reply] of (thread.replies ?? []).entries()) {
        if (reply.quotes === undefined) continue
        expect(reply.quotes, `a reply in "${thread.title}"`).toBeLessThanOrEqual(index)
        expect(reply.quotes, `a reply in "${thread.title}"`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('titles every thread differently, because the rest of the content looks them up by title', () => {
    const titles = DEMO_THREADS.map((thread) => thread.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('casts polls, thanks, messages and reports with accounts that exist', () => {
    const voters = DEMO_THREADS.flatMap((thread) =>
      (thread.poll?.options ?? []).flatMap((option) => option.voters),
    )
    const named = [
      ...voters,
      ...DEMO_THANKS.flatMap((thanks) => thanks.from),
      ...DEMO_MESSAGES.flatMap((message) => [message.from, ...message.to]),
      ...DEMO_REPORTS.map((report) => report.reporter),
    ]

    for (const key of named) expect(ACCOUNT.has(key), `"${key}"`).toBe(true)
  })

  it('never lets one account vote twice in the same poll', () => {
    for (const thread of DEMO_THREADS) {
      if (thread.poll === undefined) continue
      const voters = thread.poll.options.flatMap((option) => option.voters)
      expect(new Set(voters).size, `"${thread.title}" poll`).toBe(voters.length)
    }
  })

  it('points thanks and reports at posts that exist', () => {
    const length = new Map(
      DEMO_THREADS.map((thread) => [thread.title, 1 + (thread.replies ?? []).length]),
    )

    for (const entry of [...DEMO_THANKS, ...DEMO_REPORTS]) {
      const size = length.get(entry.threadTitle)
      expect(size, `"${entry.threadTitle}"`).toBeDefined()
      expect(entry.postIndex, `post ${entry.postIndex} of "${entry.threadTitle}"`).toBeLessThan(
        size!,
      )
    }
  })

  it('leaves the staff screens something to act on', () => {
    expect(DEMO_THREADS.some((thread) => thread.visibility === 'unapproved')).toBe(true)
    expect(DEMO_REPORTS.length).toBeGreaterThan(0)
    expect(DEMO_THREADS.some((thread) => thread.sticky === true)).toBe(true)
    expect(DEMO_THREADS.some((thread) => thread.locked === true)).toBe(true)
    expect(DEMO_THREADS.some((thread) => thread.poll !== undefined)).toBe(true)
  })
})
