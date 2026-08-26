import { ImageResponse } from 'next/og'

import { icon } from '../src/og/palette'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <svg aria-hidden="true" viewBox="0 0 32 32" width={size.width} height={size.height}>
      <g fill={icon.ground}>
        <rect x="2" y="3" width="28" height="20" rx="6" />
        <path d="M10 19 L8.4 28.6 L16.6 22.2 Z" />
      </g>
      <g fill={icon.mark}>
        <rect x="8" y="9" width="16" height="2.8" rx="1.4" />
        <rect x="8" y="14.4" width="10" height="2.8" rx="1.4" />
      </g>
    </svg>,
    size,
  )
}
