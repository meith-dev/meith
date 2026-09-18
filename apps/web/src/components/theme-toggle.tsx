'use client'

import { useEffect, useState } from 'react'

import { THEME_STORAGE_KEY } from '../theme-storage'

type Choice = 'light' | 'dark' | 'system'

const NEXT_CHOICE = { system: 'light', light: 'dark', dark: 'system' } as const

function apply(choice: Choice) {
  const root = document.documentElement
  if (choice === 'system') {
    root.removeAttribute('data-theme')
    localStorage.removeItem(THEME_STORAGE_KEY)
  } else {
    root.setAttribute('data-theme', choice)
    localStorage.setItem(THEME_STORAGE_KEY, choice)
  }
}

export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>('system')

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') setChoice(stored)
  }, [])

  const next = NEXT_CHOICE[choice]
  const label = `Colour scheme: ${choice}. Switch to ${next}`

  return (
    <button
      type="button"
      className="site-theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => {
        setChoice(next)
        apply(next)
      }}
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {choice === 'light' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : choice === 'dark' ? (
          <path d="M20.4 14.1A8.7 8.7 0 0 1 9.9 3.6a8.8 8.8 0 1 0 10.5 10.5Z" />
        ) : (
          <>
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M8 21h8m-4-4v4" />
          </>
        )}
      </svg>
    </button>
  )
}
