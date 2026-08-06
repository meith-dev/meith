import { buildSearchIndex } from "../../../src/docs/search"

export const dynamic = "force-static"

export async function GET() {
  const index = await buildSearchIndex()

  return Response.json(index, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400",
    },
  })
}
