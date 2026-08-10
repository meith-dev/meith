export interface Oklch {
  readonly l: number
  readonly c: number
  readonly h: number
}

export interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

export const MAX_CHROMA = 0.37

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

function toLinearRgb({ l, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180
  const a = c * Math.cos(radians)
  const b = c * Math.sin(radians)

  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  return {
    r: 4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    g: -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    b: -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  }
}

const gammaEncode = (channel: number): number =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055

const gammaDecode = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

export function oklchToRgb(colour: Oklch): { rgb: Rgb; inGamut: boolean } {
  const linear = toLinearRgb(colour)
  const encoded = {
    r: gammaEncode(linear.r),
    g: gammaEncode(linear.g),
    b: gammaEncode(linear.b),
  }

  const inGamut = [encoded.r, encoded.g, encoded.b].every(
    (channel) => channel >= -0.0001 && channel <= 1.0001,
  )

  return {
    rgb: { r: clamp01(encoded.r), g: clamp01(encoded.g), b: clamp01(encoded.b) },
    inGamut,
  }
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * gammaDecode(r) + 0.7152 * gammaDecode(g) + 0.0722 * gammaDecode(b)
}

export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = gammaDecode(r)
  const lg = gammaDecode(g)
  const lb = gammaDecode(b)

  const long = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const medium = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const short = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  const l = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short
  const bAxis = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short

  const c = Math.sqrt(a * a + bAxis * bAxis)
  const h = c < 1e-6 ? 0 : ((Math.atan2(bAxis, a) * 180) / Math.PI + 360) % 360

  return { l, c, h }
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const OKLCH =
  /^oklch\(\s*([+-]?(?:\d+\.?\d*|\.\d+))%?\s+([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+))\s*\)$/i

export function parseHex(value: string): Rgb | null {
  const match = HEX.exec(value.trim())
  if (match === null) return null

  const digits = match[1]!
  const full =
    digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits

  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  }
}

export function parseColour(value: string): Oklch | null {
  const hex = parseHex(value)
  if (hex !== null) return rgbToOklch(hex)

  const match = OKLCH.exec(value.trim())
  if (match === null) return null

  const raw = value.trim()
  const l = Number(match[1]) / (raw.includes('%') ? 100 : 1)
  const c = Number(match[2])
  const h = Number(match[3])
  if (![l, c, h].every(Number.isFinite)) return null

  return { l, c, h }
}

const round = (value: number, places: number): number =>
  Number(value.toFixed(places))

export function formatOklch({ l, c, h }: Oklch): string {
  return `oklch(${round(clamp01(l), 3)} ${round(Math.max(0, c), 3)} ${round(
    ((h % 360) + 360) % 360,
    1,
  )})`
}

const hexByte = (value: number): string =>
  Math.round(clamp01(value) * 255)
    .toString(16)
    .padStart(2, '0')

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`
}

export function colourToHex(value: string): string | null {
  const parsed = parseColour(value)
  return parsed === null ? null : rgbToHex(oklchToRgb(parsed).rgb)
}
