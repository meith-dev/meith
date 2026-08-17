export function Logomark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <g className="fill-accent">
        <rect x="2" y="3" width="28" height="20" rx="6" />
        <path d="M10 19 L8.4 28.6 L16.6 22.2 Z" />
      </g>
      <g className="fill-accent-contrast">
        <rect x="8" y="9" width="16" height="2.8" rx="1.4" />
        <rect x="8" y="14.4" width="10" height="2.8" rx="1.4" />
      </g>
    </svg>
  )
}
