'use client'

import { useEffect } from 'react'

type Scheme = 'light' | 'dark'

function currentScheme(): Scheme {
  const chosen = document.documentElement.getAttribute('data-theme')
  if (chosen === 'light' || chosen === 'dark') return chosen
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function MermaidDiagrams() {
  useEffect(() => {
    const figures = Array.from(
      document.querySelectorAll('.doc-body .doc-diagram[data-diagram="mermaid"]'),
    )
    if (figures.length === 0) return

    let disposed = false
    let sequence = 0

    const draw = async () => {
      const { default: mermaid } = await import('mermaid')
      if (disposed) return

      const scheme = currentScheme()
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: scheme === 'dark' ? 'dark' : 'neutral',
        fontFamily: 'inherit',
      })

      for (const figure of figures) {
        const source = figure.querySelector('pre')?.getAttribute('data-code')
        if (!source) continue

        try {
          const { svg } = await mermaid.render(`doc-diagram-${++sequence}`, source)
          if (disposed) return

          let canvas = figure.querySelector('.doc-diagram-canvas')
          if (!canvas) {
            canvas = document.createElement('div')
            canvas.className = 'doc-diagram-canvas'
            figure.append(canvas)
          }
          canvas.innerHTML = svg
          figure.setAttribute('data-rendered', 'true')
        } catch {}
      }
    }

    void draw()

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onMediaChange = () => void draw()
    media.addEventListener('change', onMediaChange)

    const observer = new MutationObserver(() => void draw())
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    return () => {
      disposed = true
      media.removeEventListener('change', onMediaChange)
      observer.disconnect()
    }
  }, [])

  return null
}
