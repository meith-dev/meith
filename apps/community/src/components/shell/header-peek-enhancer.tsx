'use client'

import { useEffect } from 'react'

const PEEKING_HEADER = '[data-header-peek]'

const SETTLE = 8

function peek(header: HTMLElement): () => void {
  let last = window.scrollY
  let ticking = false

  function settle() {
    ticking = false
    const y = Math.max(0, window.scrollY)
    const delta = y - last

    if (y <= header.offsetHeight) {
      header.removeAttribute('data-peek')
    } else if (delta > SETTLE) {
      header.setAttribute('data-peek', 'hidden')
    } else if (delta < -SETTLE) {
      header.removeAttribute('data-peek')
    } else {
      return
    }
    last = y
  }

  function onScroll() {
    if (ticking) return
    ticking = true
    window.requestAnimationFrame(settle)
  }

  function onFocusIn() {
    header.removeAttribute('data-peek')
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  header.addEventListener('focusin', onFocusIn)

  return () => {
    window.removeEventListener('scroll', onScroll)
    header.removeEventListener('focusin', onFocusIn)
    header.removeAttribute('data-peek')
  }
}

export function HeaderPeekEnhancer() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(PEEKING_HEADER)
    if (header === null) return
    return peek(header)
  }, [])

  return null
}
