export interface MarkdownFeatures {
  readonly headings: boolean
  readonly lists: boolean
  readonly quotes: boolean
  readonly code: boolean
  readonly codeSpans: boolean
  readonly tables: boolean
  readonly rules: boolean
  readonly images: boolean
  readonly links: boolean
  readonly emphasis: boolean
  readonly directives: boolean
  readonly mentions: boolean
}

export const FULL_FEATURES: MarkdownFeatures = {
  headings: true,
  lists: true,
  quotes: true,
  code: true,
  codeSpans: true,
  tables: true,
  rules: true,
  images: true,
  links: true,
  emphasis: true,
  directives: true,
  mentions: true,
}

export const SIGNATURE_FEATURES: MarkdownFeatures = {
  headings: false,
  lists: false,
  quotes: false,
  code: false,
  codeSpans: true,
  tables: false,
  rules: false,
  images: false,
  links: true,
  emphasis: true,
  directives: false,
  mentions: false,
}
