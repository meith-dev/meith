const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (whole, code: string) => {
      const point = Number(code)
      return Number.isSafeInteger(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : whole
    })
    .replace(/&(amp|lt|gt|quot|nbsp);/g, (whole) => ENTITIES[whole] ?? whole)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function decodePhpbbText(text: string, bbcodeUid: string): string {
  let out = text

  if (bbcodeUid.trim() !== '') {
    out = out.replace(new RegExp(`:${escapeRegExp(bbcodeUid.trim())}(?=[\\]:])`, 'g'), '')
  }

  out = out.replace(/<!-- s(\S+) -->.*?<!-- s\1 -->/gs, '$1')

  out = out.replace(
    /<!-- ([mwe]) --><a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a><!-- \1 -->/gs,
    (_whole, kind: string, href: string, label: string) => {
      const url = kind === 'e' ? href.replace(/^mailto:/, '') : href
      return label === href || label === url || kind === 'e' ? url : `[url=${url}]${label}[/url]`
    },
  )

  return decodeHtmlEntities(out)
}
