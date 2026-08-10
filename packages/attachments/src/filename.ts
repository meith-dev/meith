import type { AttachmentType } from './types'

export const MAX_FILENAME_LENGTH = 100

const UNSAFE = /[^A-Za-z0-9._ -]+/g

const EDGES = /^[.\s]+|[.\s]+$/g

export function sanitiseFilename(raw: string, type: AttachmentType): string {
  const extension = type.extensions[0] as string

  const base = raw.split(/[\\/]/).pop() ?? ''

  const stem = base
    .replace(/\.[^.]*$/, '')
    .replace(UNSAFE, '-')
    .replace(/-{2,}/g, '-')
    .replace(EDGES, '')
    .slice(0, MAX_FILENAME_LENGTH - extension.length - 1)
    .replace(EDGES, '')

  return `${stem === '' ? 'file' : stem}.${extension}`
}

export function storageKeyFor(
  purpose: 'source' | 'file' | 'thumb',
  random: () => string,
): string {
  return `attachments/${random()}/${purpose}`
}
