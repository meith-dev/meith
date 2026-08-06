export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s+/g, "-")
}

export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>()

  return (text: string) => {
    const base = slugify(text) || "section"
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  }
}
