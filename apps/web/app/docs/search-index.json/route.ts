import { buildSearchIndex } from "../../../src/docs/search"

/**
 * The search index, as a static file.
 *
 * `force-static` makes this a build artefact rather than a route: the JSON is
 * written once during `next build` and served from the CDN, so the palette costs
 * nothing at runtime and the deployed index cannot disagree with the deployed
 * pages — they were produced from the same read of the same Markdown.
 */
export const dynamic = "force-static"

export async function GET() {
  const index = await buildSearchIndex()

  return Response.json(index, {
    headers: {
      /*
       * A year, immutable. The URL is unversioned, but so is every page on this
       * site: a deploy replaces both at once, and a stale index would only ever
       * be stale by the length of one CDN purge.
       */
      "Cache-Control": "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400",
    },
  })
}
