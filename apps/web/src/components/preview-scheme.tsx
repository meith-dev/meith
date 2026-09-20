'use client'

import { useEffect, useState } from 'react'

export function PreviewScheme() {
  const [scheme, setScheme] = useState('light')

  useEffect(() => {
    const selected = document.documentElement.dataset.theme
    setScheme(
      selected === 'dark' ||
        (selected !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
        ? 'dark'
        : 'light',
    )
  }, [])

  return (
    <fieldset>
      <legend className="sr-only">Preview colour scheme</legend>
      {['light', 'dark'].map((value) => (
        <label className="edition-choice" key={value}>
          <input
            name="preview-scheme"
            type="radio"
            value={value}
            checked={scheme === value}
            onChange={() => setScheme(value)}
          />
          {value === 'light' ? 'Light' : 'Dark'}
        </label>
      ))}
    </fieldset>
  )
}
