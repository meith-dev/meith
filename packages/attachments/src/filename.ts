/**
 * Making a member-supplied filename safe to store and to show.
 *
 * Two separate jobs, and conflating them is the usual bug.
 *
 * **The stored name is never a path.** Nothing in this board builds an object
 * key out of it — keys are random (`storageKeyFor`) — so traversal is not the
 * threat it would be if the name reached a filesystem. It is sanitised anyway,
 * because the name is echoed into a `Content-Disposition` header and into
 * HTML, and both have their own escaping hazards.
 *
 * **The extension is derived from the sniffed type, not kept from the input.**
 * A file called `invoice.pdf.exe` whose bytes are a PNG is stored as
 * `invoice.pdf.png`: the name a member sees always matches what the bytes
 * actually are. This is the rule that stops a download's filename from
 * disagreeing with its content type, which is how a browser gets talked into
 * treating an image as something else.
 */
import type { AttachmentType } from './types'

/** Longer than this and the postbit is showing a filename instead of a post. */
export const MAX_FILENAME_LENGTH = 100

/**
 * Everything that is not a plain, boring filename character.
 *
 * An allowlist rather than a blocklist: the set of dangerous characters differs
 * per consumer (a shell, a header, an HTML attribute, a Windows path) and is
 * not knowable in advance, whereas the set of characters a filename *needs* is
 * small and stable. Control characters are included by omission, which is the
 * point — `Content-Disposition` is a header, and a newline in a header is a
 * response-splitting bug.
 */
const UNSAFE = /[^A-Za-z0-9._ -]+/g

/** Leading dots hide a file; a trailing dot or space is a Windows trap. */
const EDGES = /^[.\s]+|[.\s]+$/g

/**
 * A display name for an uploaded file, always ending in the extension its
 * *content* implies.
 *
 * Never empty: a member who uploads a file called `...` gets `file.png`, which
 * is better than a blank link nobody can click.
 */
export function sanitiseFilename(raw: string, type: AttachmentType): string {
  const extension = type.extensions[0] as string

  /* Take the last path segment first: a browser that sent `C:\Users\a\b.png`
     (some still do) should not produce a name with the whole path in it. */
  const base = raw.split(/[\\/]/).pop() ?? ''

  const stem = base
    .replace(/\.[^.]*$/, '') // drop whatever extension was claimed
    .replace(UNSAFE, '-')
    .replace(/-{2,}/g, '-')
    .replace(EDGES, '')
    .slice(0, MAX_FILENAME_LENGTH - extension.length - 1)
    .replace(EDGES, '')

  return `${stem === '' ? 'file' : stem}.${extension}`
}

/**
 * The object key for a stored file.
 *
 * Random, and unrelated to the filename or to any id. Three things follow:
 * nobody can guess another member's key and read a private community's attachment
 * straight out of a bucket; a rename cannot orphan an object; and the key is
 * fixed before the row exists, which is what lets the write order be
 * *remember, put, insert* rather than *insert, put*.
 */
export function storageKeyFor(
  purpose: 'source' | 'file' | 'thumb',
  random: () => string,
): string {
  return `attachments/${random()}/${purpose}`
}
