import type { ToolDescriptor } from "@meith/protocol";
import { useEffect, useState } from "react";
import type { MeithBridge } from "../../../bridge";

interface RunState {
  status: "idle" | "running" | "ok" | "error";
  output?: unknown;
  error?: string;
}

export function ToolsPanel({ bridge }: { bridge: MeithBridge }) {
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [args, setArgs] = useState("{}");
  const [run, setRun] = useState<RunState>({ status: "idle" });

  useEffect(() => {
    bridge.tools
      .list()
      .then((list) => {
        setTools(list);
        setSelected((cur) => cur ?? list[0]?.name ?? null);
      })
      .catch(() => undefined);
  }, [bridge]);

  const current = tools.find((t) => t.name === selected) ?? null;

  async function invoke() {
    if (!selected) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = args.trim() ? JSON.parse(args) : {};
    } catch (err) {
      setRun({ status: "error", error: `Invalid JSON arguments: ${String(err)}` });
      return;
    }
    setRun({ status: "running" });
    try {
      const result = await bridge.tools.call(selected, parsed);
      if (result.ok) {
        setRun({ status: "ok", output: result.content });
      } else {
        const code = result.error?.code ?? "TOOL_FAILED";
        const message = result.error?.message ?? "Tool failed";
        setRun({ status: "error", error: `${code}: ${message}` });
      }
    } catch (err) {
      setRun({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <section className="panel tools-panel" aria-label="Tool runner">
      <aside className="tools-list" aria-label="Available tools">
        <h2 className="panel-heading">Tools</h2>
        <ul>
          {tools.map((tool) => (
            <li key={tool.name}>
              <button
                type="button"
                className={`tool-item${tool.name === selected ? " is-active" : ""}`}
                onClick={() => {
                  setSelected(tool.name);
                  setRun({ status: "idle" });
                }}
              >
                <span className="tool-item-name">{tool.name}</span>
                <span className="tool-item-desc">{tool.description}</span>
              </button>
            </li>
          ))}
          {tools.length === 0 && <li className="tools-empty">No tools registered.</li>}
        </ul>
      </aside>

      <div className="tools-detail">
        {current ? (
          <>
            <header className="tools-detail-head">
              <h2 className="tool-title">{current.name}</h2>
              <p className="tool-description">{current.description}</p>
              {current.capabilities && current.capabilities.length > 0 && (
                <ul className="cap-badges" aria-label="Capabilities">
                  {current.capabilities.map((cap) => (
                    <li key={cap} className={`cap-badge cap-${cap}`}>
                      {cap}
                    </li>
                  ))}
                </ul>
              )}
            </header>

            <label className="field">
              <span className="field-label">Arguments (JSON)</span>
              <textarea
                className="code-input"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                spellCheck={false}
                rows={6}
              />
            </label>

            <div className="tools-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={invoke}
                disabled={run.status === "running"}
              >
                {run.status === "running" ? "Running…" : "Run tool"}
              </button>
            </div>

            <details className="schema" open>
              <summary>Input schema</summary>
              <pre className="code-block">
                {JSON.stringify(current.inputSchema, null, 2)}
              </pre>
            </details>

            {run.status !== "idle" && (
              <div className={`result result-${run.status}`}>
                <div className="result-head">
                  {run.status === "error" ? "Error" : "Result"}
                </div>
                <pre className="code-block">
                  {run.status === "error"
                    ? run.error
                    : JSON.stringify(run.output, null, 2)}
                </pre>
              </div>
            )}
          </>
        ) : (
          <div className="empty-card">
            <h2>No tool selected</h2>
            <p>Select a tool from the list to inspect its schema and run it.</p>
          </div>
        )}
      </div>
    </section>
  );
}
