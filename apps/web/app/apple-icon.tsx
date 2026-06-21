import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

// Apple touch icon: the meith mark centered on the warm-dark brand tile.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a1714",
        }}
      >
        <svg viewBox="0 0 32 32" width="124" height="124" fill="none">
          <g stroke="#f3efe9" strokeWidth="1.6" strokeLinecap="round" opacity="0.5">
            <line x1="16" y1="18.5" x2="16" y2="7.5" />
            <line x1="16" y1="18.5" x2="6.5" y2="24.5" />
            <line x1="16" y1="18.5" x2="25.5" y2="24.5" />
          </g>
          <g fill="#f3efe9" opacity="0.85">
            <circle cx="16" cy="7.5" r="2.6" />
            <circle cx="6.5" cy="24.5" r="2.6" />
            <circle cx="25.5" cy="24.5" r="2.6" />
          </g>
          <circle cx="16" cy="18.5" r="4.4" fill="#e8a13c" />
          <circle cx="16" cy="18.5" r="1.7" fill="#2a2118" />
        </svg>
      </div>
    ),
    { ...size },
  )
}
