import { terminal } from "../content/site"

export function Terminal({ className }: { className?: string }) {
  return (
    <div className={`terminal ${className ?? ""}`}>
      <div className="terminal-bar">
        <span aria-hidden>▸</span>
        <span>{terminal.cwd}</span>
      </div>
      <div className="terminal-body">
        {terminal.lines.map((line) => (
          <div key={line.text} className="terminal-line" data-out={line.output ? "" : undefined}>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  )
}
