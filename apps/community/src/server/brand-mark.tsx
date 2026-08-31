import 'server-only'

import { ImageResponse } from 'next/og'
import type { ReactElement } from 'react'

import { type BrandInfo, loadBrandInfo, loadLogoDataUri, loadMarkDataUri } from './brand-assets'

interface MarkOptions {
  readonly size: number
  readonly maskable?: boolean
}

function markElement(info: BrandInfo, logo: string | null, options: MarkOptions): ReactElement {
  const palette = info.light
  const safeArea = options.maskable ? 0.62 : 0.76
  const box = Math.round(options.size * safeArea)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: palette.background,
      }}
    >
      {logo === null ? (
        <div
          style={{
            display: 'flex',
            fontSize: Math.round(box * 0.72),
            fontWeight: 700,
            color: palette.primary,
          }}
        >
          {info.initials}
        </div>
      ) : (
        <img src={logo} width={box} height={box} style={{ objectFit: 'contain' }} alt="" />
      )}
    </div>
  )
}

function socialElement(info: BrandInfo, logo: string | null): ReactElement {
  const palette = info.light

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        background: palette.background,
        padding: '80px',
      }}
    >
      {logo !== null && (
        <img src={logo} height={112} style={{ objectFit: 'contain', marginBottom: 44 }} alt="" />
      )}
      <div
        style={{
          display: 'flex',
          fontSize: 74,
          fontWeight: 700,
          color: palette.foreground,
          lineHeight: 1.05,
        }}
      >
        {info.title}
      </div>
      {info.description !== '' && (
        <div style={{ display: 'flex', fontSize: 34, color: palette.muted, marginTop: 28 }}>
          {info.description}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          width: 184,
          height: 14,
          background: palette.primary,
          borderRadius: 7,
          marginTop: 48,
        }}
      />
    </div>
  )
}

export async function renderBrandMark(size: number, maskable = false): Promise<ImageResponse> {
  const info = await loadBrandInfo()
  const logo = await loadMarkDataUri()

  return new ImageResponse(markElement(info, logo, { size, maskable }), {
    width: size,
    height: size,
  })
}

export async function renderBrandSocial(): Promise<ImageResponse> {
  const info = await loadBrandInfo()
  const logo = await loadLogoDataUri('light')

  return new ImageResponse(socialElement(info, logo), { width: 1200, height: 630 })
}
