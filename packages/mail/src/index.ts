export {
  absoluteUrl,
  buildMailBrand,
  type MailBrand,
  type MailLogo,
  mailLogo,
  normaliseBoardUrl,
} from './brand'
export {
  type MailBody,
  type MailFooterLine,
  type MailLink,
  type RenderedMail,
  renderMail,
  renderMailHtml,
  renderMailText,
  safeHref,
} from './document'
export {
  FALLBACK_PALETTE,
  type MailPalette,
  type MailScheme,
  mailPalette,
  mergeTokenOverrides,
  type ThemeTokenSet,
  type TokenRecord,
} from './palette'
