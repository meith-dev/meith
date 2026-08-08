/**
 * OKLCH, and the sRGB it has to survive contact with.
 *
 * ## Why the board's colours are OKLCH in the first place
 *
 * Because the two things an operator actually does to a palette — "the same
 * colour but lighter" and "the same lightness, different hue" — are one
 * coordinate each in OKLCH and neither is expressible in hex. `#3b5998` lighter
 * is a guess; `oklch(0.49 0.13 264)` at `0.62` lightness is the same colour,
 * lighter, with its chroma and hue untouched. The default theme's tokens are
 * written this way for exactly that reason, and the editor used to hand them to
 * a control that could not represent them.
 *
 * ## Why this is a module and not a dependency
 *
 * The conversions are about forty lines of arithmetic with published
 * coefficients. A colour library is a much larger surface for a board that
 * needs one colour space and one gamut, and this has to run in the browser for
 * the picker as well as on the server for `<meta name="theme-color">` — so it
 * is plain functions with no imports, usable from both.
 *
 * ## Gamut is a real answer, not a rounding detail
 *
 * OKLCH describes colours sRGB cannot show. `oklch(0.7 0.3 150)` is a
 * perfectly well-formed green that no ordinary screen can produce, and the
 * honest thing to tell an operator who has dragged chroma past the edge is that
 * they have — not to silently clamp and leave them wondering why the swatch
 * stopped moving. So conversion reports whether it had to clamp, and the picker
 * says so.
 */

export interface Oklch {
  /** Perceptual lightness, 0–1. */
  readonly l: number
  /** Chroma, 0 to about 0.37 in sRGB. Not bounded above by the space itself. */
  readonly c: number
  /** Hue angle in degrees, 0–360. */
  readonly h: number
}

export interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

/** Chroma beyond this is outside sRGB at every hue, so the slider stops here. */
export const MAX_CHROMA = 0.37

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** OKLCH → linear sRGB. The published matrices, in one place. */
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

/**
 * Convert, and say whether sRGB could hold it.
 *
 * `inGamut` is false when any channel left 0–1 *before* clamping. That is the
 * only moment the information exists — afterwards every colour looks perfectly
 * representable, which is why a converter that clamps silently can never tell
 * an operator their chroma slider stopped meaning anything.
 */
export function oklchToRgb(colour: Oklch): { rgb: Rgb; inGamut: boolean } {
  const linear = toLinearRgb(colour)
  const encoded = {
    r: gammaEncode(linear.r),
    g: gammaEncode(linear.g),
    b: gammaEncode(linear.b),
  }

  const inGamut = [encoded.r, encoded.g, encoded.b].every(
    /* A hair of tolerance: the round trip is floating point, not arithmetic. */
    (channel) => channel >= -0.0001 && channel <= 1.0001,
  )

  return {
    rgb: { r: clamp01(encoded.r), g: clamp01(encoded.g), b: clamp01(encoded.b) },
    inGamut,
  }
}

/**
 * WCAG relative luminance, from sRGB channels in 0–1.
 *
 * Here rather than in `@/view/contrast`, which is the only caller, because it
 * is the *same transfer function* as the encode two lines up — and a second
 * copy of a gamma curve written from the same specification is the kind of
 * duplicate that stays right until somebody fixes a threshold in one of them.
 * What belongs in the contrast module is which colour sits on which, not how
 * sRGB is linearised.
 */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * gammaDecode(r) + 0.7152 * gammaDecode(g) + 0.0722 * gammaDecode(b)
}

/** sRGB → OKLCH. Needed to seed the picker from a hex value. */
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
  /*
   * Hue is meaningless at zero chroma — every angle is the same grey — so it is
   * reported as 0 rather than as whatever `atan2` makes of two zeroes. Without
   * this, dragging chroma up from a grey would start from a random hue.
   */
  const h = c < 1e-6 ? 0 : ((Math.atan2(bAxis, a) * 180) / Math.PI + 360) % 360

  return { l, c, h }
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const OKLCH =
  /^oklch\(\s*([+-]?(?:\d+\.?\d*|\.\d+))%?\s+([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+))\s*\)$/i

/** Expand `#abc`, or return null. */
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

/**
 * Read either notation the board stores.
 *
 * A percentage on lightness is accepted because CSS permits it and an operator
 * pasting from a design tool will hit it; it is divided out here so everything
 * downstream deals in 0–1.
 */
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

/**
 * The canonical way this board writes a colour.
 *
 * Three, three and one decimal places: enough that a round trip through the
 * picker does not drift, few enough that the value stays something a person can
 * read and type. Trailing zeroes are dropped by `Number`, so `0.500` is `0.5`.
 */
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

/**
 * Any colour this board accepts, as sRGB hex, or `null`.
 *
 * The one place a literal colour is legitimate — `<meta name="theme-color">`,
 * which Safari and older Chrome ignore when given `oklch()` — and the value the
 * picker's swatch needs when it wants a colour a `<canvas>` or an `<input>` can
 * hold.
 */
export function colourToHex(value: string): string | null {
  const parsed = parseColour(value)
  return parsed === null ? null : rgbToHex(oklchToRgb(parsed).rgb)
}
