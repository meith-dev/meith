import { ImageResponse } from 'next/og'
import type { ReactElement } from 'react'

import { OG_SIZE } from './card'
import { ogFonts } from './fonts'

export async function ogResponse(element: ReactElement): Promise<ImageResponse> {
  return new ImageResponse(element, { ...OG_SIZE, fonts: await ogFonts() })
}
