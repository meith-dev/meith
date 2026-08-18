'use client'

import { createContext, useContext } from 'react'

import type { Copy } from './copy-record'

export { type Copy, formatFromCopy, fromCopy } from './copy-record'

const CopyContext = createContext<Copy>({})

export function CopyProvider({ copy, children }: { copy: Copy; children: React.ReactNode }) {
  return <CopyContext.Provider value={copy}>{children}</CopyContext.Provider>
}

export function useCopy(): Copy {
  return useContext(CopyContext)
}
