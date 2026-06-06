import type { AppState } from "@meith/shared";

export function StatePanel({ state }: { state: AppState | null }) {
  if (!state) {
    return (
      <section className="panel">
        <div className="empty-card">
          <h2>Loading state…</h2>
          <p>Reading the persistent application state from the runtime.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel state-panel" aria-label="Application state">
      <h2 className="panel-heading">Spaces</h2>
      <div className="cards">
        {state.spaces.map((space) => (
          <article
            key={space.id}
            className={`card${space.id === state.activeSpaceId ? " is-active" : ""}`}
          >
            <span
              className="card-swatch"
              style={{ background: space.color ?? "#6366f1" }}
            />
            <div>
              <div className="card-title">{space.name}</div>
              <div className="card-meta">{space.id}</div>
            </div>
            {space.id === state.activeSpaceId && <span className="card-tag">active</span>}
          </article>
        ))}
      </div>

      <h2 className="panel-heading">Browser tabs</h2>
      <TabTable
        rows={state.browserTabs.map((t) => ({
          id: t.id,
          primary: t.title,
          secondary: t.url,
          active: t.active,
          badges: [
            t.loadState !== "idle" ? t.loadState : null,
            t.ownerId ? `owned: ${t.ownerId}` : null,
          ].filter((b): b is string => b !== null),
        }))}
        empty="No browser tabs. Run open_browser_tab to add one."
      />

      <h2 className="panel-heading">Workspace tabs</h2>
      <TabTable
        rows={state.workspaceTabs.map((t) => ({
          id: t.id,
          primary: `${t.title} (${t.kind})`,
          secondary: t.cwd,
          active: t.active,
          badges: [],
        }))}
        empty="No workspace tabs yet."
      />

      <details className="schema">
        <summary>Raw state JSON</summary>
        <pre className="code-block">{JSON.stringify(state, null, 2)}</pre>
      </details>
    </section>
  );
}

interface TabRow {
  id: string;
  primary: string;
  secondary: string;
  active: boolean;
  badges: string[];
}

function TabTable({ rows, empty }: { rows: TabRow[]; empty: string }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="tab-list">
      {rows.map((row) => (
        <li key={row.id} className={`tab-row${row.active ? " is-active" : ""}`}>
          <span className="tab-primary">{row.primary}</span>
          <span className="tab-secondary">{row.secondary}</span>
          {row.badges.map((badge) => (
            <span key={badge} className="card-tag">
              {badge}
            </span>
          ))}
          {row.active && <span className="card-tag">active</span>}
        </li>
      ))}
    </ul>
  );
}
