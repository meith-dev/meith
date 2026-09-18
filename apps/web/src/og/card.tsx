import { card } from './palette'

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = 'image/png'

export function ogImage(url: string, alt: string) {
  return [{ url, width: OG_SIZE.width, height: OG_SIZE.height, alt }]
}

export function OgMark({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" width={size} height={size}>
      <g fill={card.accent}>
        <rect x="2" y="3" width="28" height="20" rx="6" />
        <path d="M10 19 L8.4 28.6 L16.6 22.2 Z" />
      </g>
      <g fill={card.accentContrast}>
        <rect x="8" y="9" width="16" height="2.8" rx="1.4" />
        <rect x="8" y="14.4" width="10" height="2.8" rx="1.4" />
      </g>
    </svg>
  )
}

export function ogExcerpt(text: string, limit = 170): string {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

export function OgCard({
  eyebrow,
  title,
  emphasis,
  description,
}: {
  eyebrow: string
  title: string
  emphasis?: string
  description: string
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: card.canvas,
        padding: '60px 72px',
        color: card.fg,
        fontFamily: 'Inter',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `2px solid ${card.fg}`,
          paddingBottom: 26,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <OgMark size={44} />
          <div style={{ display: 'flex', fontSize: 34, letterSpacing: '-0.02em', fontWeight: 600 }}>
            Meith
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: card.fgSubtle,
          }}
        >
          meith.dev
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: card.accent,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            maxWidth: 1040,
            fontSize: 78,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
          }}
        >
          <div style={{ display: 'flex' }}>{title}</div>
          {emphasis === undefined ? null : (
            <div
              style={{
                display: 'flex',
                color: card.accent,
                fontFamily: 'Lora',
                fontStyle: 'italic',
                letterSpacing: '-0.01em',
              }}
            >
              {emphasis}
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            maxWidth: 940,
            fontSize: 30,
            lineHeight: 1.4,
            color: card.fgMuted,
          }}
        >
          {ogExcerpt(description)}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: `1px solid ${card.borderStrong}`,
          paddingTop: 26,
          fontSize: 23,
          color: card.fgSubtle,
        }}
      >
        <div style={{ display: 'flex' }}>Free & open source · Self-hosted · Yours to keep</div>
        <div style={{ display: 'flex' }}>Built in the open</div>
      </div>
    </div>
  )
}
