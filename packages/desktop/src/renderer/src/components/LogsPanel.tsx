import type { LogEntry } from "@meith/shared";
import { useEffect, useRef, useState } from "react";
import type { MeithBridge } from "../../../bridge";

export function LogsPanel({ bridge }: { bridge: MeithBridge }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    bridge.logs
      .get(500)
      .then((list) => mounted && setEntries(list))
      .catch(() => undefined);
    const off = bridge.logs.onEntry((entry) => {
      setEntries((prev) => [...prev, entry].slice(-500));
    });
    return () => {
      mounted = false;
      off();
    };
  }, [bridge]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries]);

  return (
    <section className="panel logs-panel" aria-label="Application logs">
      <h2 className="panel-heading">Logs</h2>
      <div className="log-view" role="log" aria-live="polite">
        {entries.length === 0 ? (
          <p className="muted">No log entries yet.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={`log-line log-${entry.level}`}>
              <span className="log-time">{formatTime(entry.ts)}</span>
              <span className={`log-level log-level-${entry.level}`}>{entry.level}</span>
              <span className="log-source">{entry.source}</span>
              <span className="log-message">{entry.message}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </section>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false });
}
