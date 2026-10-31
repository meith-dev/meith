import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  forumIdsWhere: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: (href: string): never => {
    throw new Error(`redirect:${href}`)
  },
  notFound: (): never => {
    throw new Error('not-found')
  },
}))
vi.mock('./container', () => ({
  getContainer: () => ({
    forums: { findById: mocks.findById },
    authorizer: { forumIdsWhere: mocks.forumIdsWhere },
  }),
}))
vi.mock('./context', () => ({ getActor: async () => ({ userId: null }) }))

import JumpPage from '../../app/jump/page'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.forumIdsWhere.mockResolvedValue([10])
  mocks.findById.mockResolvedValue({
    id: 10,
    slug: 'destination',
    type: 'link',
    linkUrl: 'https://example.test/path',
  })
})

const jump = (forum = '10') => JumpPage({ searchParams: Promise.resolve({ forum }) })

describe('forum jump destinations', () => {
  it.each(['https://example.test/path', '/local/path'])(
    'follows a safe link forum to %s',
    async (linkUrl) => {
      mocks.findById.mockResolvedValue({ type: 'link', linkUrl })
      await expect(jump()).rejects.toThrow(`redirect:${linkUrl}`)
    },
  )

  it.each([null, 'javascript:alert(1)', 'data:text/html,unsafe'])(
    'sends an unsafe or missing link %s to the board',
    async (linkUrl) => {
      mocks.findById.mockResolvedValue({ type: 'link', linkUrl })
      await expect(jump()).rejects.toThrow('redirect:/')
    },
  )

  it('checks permission before looking up the destination', async () => {
    mocks.forumIdsWhere.mockResolvedValue([])
    await expect(jump()).rejects.toThrow('not-found')
    expect(mocks.findById).not.toHaveBeenCalled()
  })

  it('retains normal forum navigation', async () => {
    mocks.findById.mockResolvedValue({ id: 10, type: 'forum', slug: 'destination' })
    await expect(jump()).rejects.toThrow('redirect:/10-destination')
  })

  it('returns categories and empty selections to the board', async () => {
    mocks.findById.mockResolvedValue({ type: 'category' })
    await expect(jump()).rejects.toThrow('redirect:/')
    await expect(jump('')).rejects.toThrow('redirect:/')
  })
})
