'use client'

import { useEffect, useState } from 'react'

import { PROGRESSIVE_FIELD } from '@/view/progressive-enhancement'

export function ProgressiveMarker() {
  const [enhanced, setEnhanced] = useState(false)

  useEffect(() => setEnhanced(true), [])

  return enhanced ? <input type="hidden" name={PROGRESSIVE_FIELD} value="1" /> : null
}
