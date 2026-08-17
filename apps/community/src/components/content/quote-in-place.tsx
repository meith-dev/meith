'use client'

import { useEffect } from 'react'

import { quotePostAction } from '@/server/content-actions'

import { composerField, insertQuotes } from './composer-field'

function quotedPostId(href: string): number | null {
  const match = /[?&]quote=(\d+)(?:&|$)/.exec(href)
  if (match === null) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function QuoteInPlace({ threadId }: { threadId: number }) {
  useEffect(() => {
    async function onClick(event: MouseEvent): Promise<void> {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const link = (event.target as Element | null)?.closest?.('a[href]')
      if (!(link instanceof HTMLAnchorElement)) return

      const postId = quotedPostId(link.getAttribute('href') ?? '')
      if (postId === null) return

      const field = composerField()
      if (field === null) return

      event.preventDefault()

      try {
        const quote = await quotePostAction(threadId, postId)
        if (quote === null) {
          window.location.assign(link.href)
          return
        }
        insertQuotes(field, [quote], { reveal: true })
      } catch {
        window.location.assign(link.href)
      }
    }

    const handler = (event: MouseEvent): void => void onClick(event)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [threadId])

  return null
}
