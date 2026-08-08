"use client"

/**
 * Quoting without leaving the thread (F45).
 *
 * The board has always been able to quote: every postbit carries a `Quote` link
 * to `/thread/…/reply?quote=<id>`, the reply page prefills from it, and that
 * works with scripting off. What it costs is the page — a reader three screens
 * into a conversation loses their place, and the quick reply they were about to
 * type into is the thing they navigated away from.
 *
 * This is the same act without the navigation: click Quote, and the quote lands
 * in the composer already on the page.
 *
 * ## It enhances a link the theme rendered; it does not replace it
 *
 * There is no new control and no theme change. The island listens for clicks on
 * the thread and, when one lands on a link whose href carries `?quote=<id>`,
 * handles it here instead. A theme that renders its quote link differently, a
 * plugin that adds one, a link in a region this file has never heard of: all of
 * them are enhanced by the same rule, because the rule is about the *href*.
 *
 * Everything about the fallback follows from that. Scripting off, the click is
 * a navigation. A modifier key held, it is a navigation — somebody opening a
 * quote link in a new tab means it. The action failing, it is a navigation.
 * There is no state in which the button stops working; the worst case is that
 * it works the way it did before.
 *
 * ## The quote comes from the server, by id
 *
 * `quotePostAction` takes the thread and the post and returns the block. The
 * page never supplies the text, which is what makes this safe rather than
 * merely convenient: the source is re-read through the same visibility lookup
 * the reply page uses, so a reader cannot quote a post they were not shown, and
 * a deleted post cannot be republished by quoting it. A client that assembled
 * the quote from the DOM would trust whatever was in the DOM.
 */

import { useEffect } from "react"

import { quotePostAction } from "@/server/content-actions"

/** `/thread/12-slug/reply?quote=34` → 34. */
function quotedPostId(href: string): number | null {
  const match = /[?&]quote=(\d+)(?:&|$)/.exec(href)
  if (match === null) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/**
 * Put the quote in the box, and put the box in front of the reader.
 *
 * The order matters: opening the disclosure before focusing, because focusing a
 * control inside a closed `<details>` does nothing on some browsers and scrolls
 * the page to a collapsed panel on others.
 */
function insert(field: HTMLTextAreaElement, quote: string): void {
  const existing = field.value.replace(/\s+$/, "")
  field.value = existing === "" ? `${quote}\n\n` : `${existing}\n\n${quote}\n\n`

  const panel = field.closest("details")
  if (panel !== null) panel.open = true

  /* The caret goes *after* the quote, which is where the reply gets typed. */
  field.setSelectionRange(field.value.length, field.value.length)
  field.focus()
  field.scrollIntoView({ block: "center", behavior: "smooth" })

  /*
   * The composer grows itself on `input`, and setting `.value` fires nothing.
   * Without this a quoted paragraph lands in a box still sized for the empty
   * one, and the reader types into a six-line window over their own quote.
   */
  field.dispatchEvent(new Event("input", { bubbles: true }))
}

export function QuoteInPlace({ threadId }: { threadId: number }) {
  useEffect(() => {
    async function onClick(event: MouseEvent): Promise<void> {
      /*
       * A middle click, or any modifier: somebody opening the quote in a new
       * tab or a new window means it, and stealing that is the rudest thing a
       * click handler can do.
       */
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const link = (event.target as Element | null)?.closest?.("a[href]")
      if (!(link instanceof HTMLAnchorElement)) return

      const postId = quotedPostId(link.getAttribute("href") ?? "")
      if (postId === null) return

      /* No composer on this page — the link is the mechanism, so let it be. */
      const field = document.getElementById("post-message")
      if (!(field instanceof HTMLTextAreaElement)) return

      event.preventDefault()

      try {
        const quote = await quotePostAction(threadId, postId)
        /*
         * `null` is "the server will not quote that for you" — a post that has
         * been deleted since the page was drawn, or one in a forum this reader
         * lost access to while reading. Falling back to the link means they get
         * the reply page's answer, which is the honest one, rather than a
         * button that silently did nothing.
         */
        if (quote === null) {
          window.location.assign(link.href)
          return
        }
        insert(field, quote)
      } catch {
        window.location.assign(link.href)
      }
    }

    const handler = (event: MouseEvent): void => void onClick(event)
    document.addEventListener("click", handler)
    return () => document.removeEventListener("click", handler)
  }, [threadId])

  return null
}
