import 'server-only'

/**
 * F42 — the download response.
 *
 * Shared by the file and thumbnail routes, because the headers *are* the
 * security control and two copies of them would eventually disagree. The
 * difference between the two routes is one argument.
 *
 * ## Why the bytes go through the app
 *
 * `S3FileStore` can sign a URL and ADR 0002 named that as what F42 would rely
 * on. Building it disproved the assumption, so the reason is recorded rather
 * than quietly dropped. A signed URL is a bearer token for one object, and
 * three things here cannot be done with one:
 *
 *  - **`Content-Disposition: attachment` and `nosniff` are what make serving
 *    member-supplied bytes safe.** A signed URL serves whatever headers the
 *    bucket carries, and per-request overrides need a signing API the
 *    `FileStore` port does not expose.
 *  - **The permission is re-checked on every fetch.** A signed URL outlives the
 *    permission that issued it: move a thread into a private forum and every
 *    URL handed out in the last hour still works.
 *  - **The download is counted**, which needs a request to count.
 *
 * The cost is bandwidth through the app, which is the right trade at attachment
 * sizes. Revisit with a `FileStore` that can sign *with* response headers —
 * noted against F89 rather than assumed here.
 *
 * ## Every refusal is a 404
 *
 * Distinguishing "no such attachment" from "not for you" would make this an
 * oracle for what exists in forums the caller cannot see, and the id is a small
 * integer anybody can enumerate.
 */
import { drivers } from '@meith/drivers'

import { resolveDownload } from './attachments'
import { getActor } from './context'
import { getContainer } from './container'

function notFound(): Response {
  return new Response('Not found', { status: 404 })
}

/**
 * The filename, as a header value.
 *
 * `sanitiseFilename` has already removed everything that could break a header.
 * This is the second fence, and it is here because the first one lives in
 * another package and a header injection is not a bug worth being tidy about.
 */
function contentDisposition(filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._ -]/g, '_')
  return `attachment; filename="${safe}"`
}

export async function serveAttachment(
  rawId: string,
  want: 'file' | 'thumb',
): Promise<Response> {
  if (!/^[1-9]\d*$/.test(rawId)) return notFound()

  const actor = await getActor()
  const grant = await resolveDownload(actor, Number(rawId), want)
  if (grant === null) return notFound()

  const bytes = await drivers().files.get(grant.key)
  /*
   * A `ready` row whose object has gone. Not a 500: from a reader's point of
   * view this is one broken image on a page that is otherwise fine, and an
   * error page would be a worse answer to give them.
   */
  if (bytes === undefined) return notFound()

  /*
   * Counted for the file, not the thumbnail. A thumbnail is fetched by the page
   * that lists the attachment, so counting it would make "downloads" mean "page
   * views of the thread" — which is a number the board already has.
   */
  if (want === 'file') {
    await getContainer().attachments?.recordDownload(grant.record.id)
  }

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': grant.contentType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': contentDisposition(grant.filename),
      /*
       * `nosniff` stops a browser deciding a `.zip` is really HTML. The CSP is
       * a second fence around anything that does get interpreted, and `DENY`
       * stops the response being framed by another site.
       */
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Frame-Options': 'DENY',
      /*
       * Private and revalidated. The permission is re-checked per request, so a
       * shared cache answering for us would be a permission check skipped.
       */
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
}
