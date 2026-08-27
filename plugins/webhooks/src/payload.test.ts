import { describe, expect, it } from 'vitest'

import { bodyFor, discordBody, eventLink, jsonBody, type WebhookEvent } from './payload'

const THREAD: WebhookEvent = {
  kind: 'thread.created',
  threadId: 12,
  forumId: 3,
  authorId: 7,
  subject: 'Raid night moved to Thursday',
}

const POST: WebhookEvent = {
  kind: 'post.created',
  postId: 99,
  threadId: 12,
  forumId: 3,
  authorId: 7,
}

describe('the link an event points at', () => {
  it('links a thread at its own page and a reply at its post', () => {
    expect(eventLink('https://board.example', THREAD)).toBe('https://board.example/threads/12')
    expect(eventLink('https://board.example', POST)).toBe(
      'https://board.example/threads/12#post-99',
    )
  })

  it('does not double the slash when the board address carries one', () => {
    expect(eventLink('https://board.example/', THREAD)).toBe('https://board.example/threads/12')
  })
})

describe('the Discord body', () => {
  it('carries the thread’s own subject as the embed title, and no English of ours', () => {
    const body = discordBody(THREAD, 'https://board.example')

    expect(body).toEqual({
      content: 'https://board.example/threads/12',
      embeds: [{ title: 'Raid night moved to Thursday', url: 'https://board.example/threads/12' }],
    })
  })

  it('sends a reply as a bare link, since a reply has no subject of its own', () => {
    expect(discordBody(POST, 'https://board.example')).toEqual({
      content: 'https://board.example/threads/12#post-99',
    })
  })

  it('omits the embed when a thread arrives with a blank subject', () => {
    expect(discordBody({ ...THREAD, subject: '   ' }, 'https://board.example')).toEqual({
      content: 'https://board.example/threads/12',
    })
  })
})

describe('the plain-JSON body', () => {
  it('names the event and the ids a receiver would key on', () => {
    expect(jsonBody(THREAD, 'https://board.example')).toEqual({
      event: 'thread.created',
      url: 'https://board.example/threads/12',
      threadId: 12,
      forumId: 3,
      authorId: 7,
      subject: 'Raid night moved to Thursday',
    })
  })

  it('carries the post id for a reply', () => {
    expect(jsonBody(POST, 'https://board.example')).toMatchObject({
      event: 'post.created',
      postId: 99,
      threadId: 12,
    })
  })

  it('reports a guest author as null rather than inventing an id', () => {
    expect(jsonBody({ ...POST, authorId: null }, 'https://board.example')).toMatchObject({
      authorId: null,
    })
  })
})

describe('bodyFor', () => {
  it('picks the shape the configured format asks for', () => {
    expect(bodyFor(THREAD, 'discord', 'https://b.example')).toHaveProperty('embeds')
    expect(bodyFor(THREAD, 'json', 'https://b.example')).toHaveProperty('event')
  })
})
