const SHARED = {
  'aria-hidden': true,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'size-3.5 shrink-0',
} as const

export function SunIcon() {
  return (
    <svg {...SHARED}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06M12.95 12.95l-1.06-1.06M4.11 4.11L3.05 3.05" />
    </svg>
  )
}

export function MonitorIcon() {
  return (
    <svg {...SHARED}>
      <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
      <path d="M5.5 14.5h5M8 11.5v3" />
    </svg>
  )
}

export function MoonIcon() {
  return (
    <svg {...SHARED}>
      <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" />
    </svg>
  )
}
