'use client'

import { useEffect, useState } from 'react'

import { INSTALL_BANNER_COOKIE, INSTALL_BANNER_COOKIE_MAX_AGE } from '@/view/install-banner'

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>
}

interface CookieStoreLike {
  set(init: {
    readonly name: string
    readonly value: string
    readonly path: string
    readonly expires: number
    readonly sameSite: 'lax'
  }): Promise<void>
}

function isInstallPrompt(event: Event): event is InstallPrompt {
  return 'prompt' in event && 'userChoice' in event
}

const BUTTON =
  'inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function InstallAction({ label, how }: { label: string; how: string }) {
  const [pending, setPending] = useState<InstallPrompt | null>(null)

  useEffect(() => {
    const capture = (event: Event) => {
      if (!isInstallPrompt(event)) return
      event.preventDefault()
      setPending(event)
    }
    const installed = () => setPending(null)

    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', capture)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  if (pending !== null) {
    const install = () => {
      const prompt = pending
      setPending(null)
      prompt
        .prompt()
        .then(() => prompt.userChoice)
        .then((choice) => {
          if (choice.outcome !== 'accepted') return
          const store = (window as { cookieStore?: CookieStoreLike }).cookieStore
          return store?.set({
            name: INSTALL_BANNER_COOKIE,
            value: '1',
            path: '/',
            expires: Date.now() + INSTALL_BANNER_COOKIE_MAX_AGE * 1000,
            sameSite: 'lax',
          })
        })
        .catch(() => {})
    }

    return (
      <button type="button" onClick={install} className={BUTTON}>
        {label}
      </button>
    )
  }

  return (
    <details>
      <summary className={`${BUTTON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        {label}
      </summary>
      <p className="absolute inset-x-0 bottom-full z-10 mb-2 rounded-md border border-border bg-card p-3 text-xs text-muted-foreground shadow-lg">
        {how}
      </p>
    </details>
  )
}
