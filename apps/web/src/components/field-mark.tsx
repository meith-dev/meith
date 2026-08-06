export function FieldMark({ className, lit = false }: { className?: string; lit?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path d="M2 2 L15 3 L14 15 L3 14 Z" className="fill-field-a" />
      <path
        d="M15 3 L30 2 L29 16 L14 15 Z"
        className={lit ? "fill-gorse-flat" : "fill-field-b"}
        opacity={lit ? 0.6 : 1}
      />
      <path d="M3 14 L14 15 L15 30 L2 29 Z" className="fill-field-b" />
      <path d="M14 15 L29 16 L30 30 L15 30 Z" className="fill-field-a" />
      <g fill="none" className="stroke-lichen" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M2 2 L15 3 L14 15 L3 14 Z" />
        <path d="M15 3 L30 2 L29 16 L14 15 Z" />
        <path d="M3 14 L14 15 L15 30 L2 29 Z" />
        <path d="M14 15 L29 16 L30 30 L15 30 Z" />
      </g>
    </svg>
  )
}
