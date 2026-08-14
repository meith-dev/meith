import type { Shot } from "../content/site"

export function Screenshot({
  shot,
  className,
  priority = false,
}: {
  shot: Shot
  className?: string
  priority?: boolean
}) {
  return (
    <img
      alt={shot.alt}
      className={className === undefined ? "shot" : `shot ${className}`}
      decoding={priority ? "sync" : "async"}
      height={shot.height}
      loading={priority ? "eager" : "lazy"}
      src={shot.file}
      width={shot.width}
    />
  )
}

export function SchemeScreenshot({
  light,
  dark,
  className,
  priority = false,
}: {
  light: Shot
  dark: Shot
  className?: string
  priority?: boolean
}) {
  const shared = className === undefined ? "" : ` ${className}`

  return (
    <>
      <Screenshot className={`shot-light${shared}`} priority={priority} shot={light} />
      <Screenshot className={`shot-dark${shared}`} priority={priority} shot={dark} />
    </>
  )
}
