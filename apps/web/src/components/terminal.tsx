import { terminal } from '../content/site'

interface TerminalContent {
  readonly cwd: string
  readonly lines: readonly { readonly text: string; readonly output?: boolean }[]
}

export function Terminal({
  className,
  content = terminal,
}: {
  className?: string
  content?: TerminalContent
}) {
  return (
    <div className={`terminal ${className ?? ''}`}>
      <div className="terminal-bar">
        <span aria-hidden>▸</span>
        <span>{content.cwd}</span>
      </div>
      <div className="terminal-body">
        {content.lines.map((line) => (
          <div key={line.text} className="terminal-line" data-out={line.output ? '' : undefined}>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  )
}
