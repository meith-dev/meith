import { ImageResponse } from 'next/og'

import { icon } from '../src/og/palette'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: icon.ground,
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 32 32" width={128} height={128}>
        <g fill={icon.mark}>
          <rect x="2" y="3" width="28" height="20" rx="6" />
          <path d="M10 19 L8.4 28.6 L16.6 22.2 Z" />
        </g>
        <g fill={icon.ground}>
          <rect x="8" y="9" width="16" height="2.8" rx="1.4" />
          <rect x="8" y="14.4" width="10" height="2.8" rx="1.4" />
        </g>
      </svg>
    </div>,
    size,
  )
}
