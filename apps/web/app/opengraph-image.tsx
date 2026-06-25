import { ImageResponse } from "next/og"
import { siteConfig } from "@/lib/site"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = `${siteConfig.name} — ${siteConfig.tagline}`

// Branded OpenGraph / social card matching the hero aesthetic:
// warm-dark canvas, the meith mark + wordmark, and the tagline.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#1a1714",
          backgroundImage:
            "linear-gradient(rgba(243,239,233,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(243,239,233,0.05) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg viewBox="0 0 32 32" width="52" height="52" fill="none">
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
          <span style={{ fontSize: 34, fontWeight: 600, color: "#f3efe9" }}>meith</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "#f3efe9",
            }}
          >
            Build web apps with{" "}
            <span style={{ color: "#e8a13c" }}>&nbsp;an AI that ships.</span>
          </div>
          <div style={{ fontSize: 30, color: "#b8b0a4", maxWidth: 900, lineHeight: 1.4 }}>
            {siteConfig.description}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 24, color: "#8f877b" }}>
          {`${siteConfig.license} licensed · ${siteConfig.platforms}`}
        </div>
      </div>
    ),
    { ...size },
  )
}
