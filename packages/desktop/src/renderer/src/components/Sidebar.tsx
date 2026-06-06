import type { View } from "../App";

const items: { id: View; label: string; icon: string }[] = [
  { id: "tools", label: "Tools", icon: "M7 7l-3 3 3 3M17 7l3 3-3 3M14 4l-4 16" },
  { id: "state", label: "State", icon: "M4 6h16M4 12h16M4 18h10" },
  { id: "logs", label: "Logs", icon: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" },
];

export function Sidebar({
  view,
  onViewChange,
}: {
  view: View;
  onViewChange: (v: View) => void;
}) {
  return (
    <nav className="sidebar" aria-label="Primary">
      <ul className="sidebar-nav">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`sidebar-btn${view === item.id ? " is-active" : ""}`}
              onClick={() => onViewChange(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  d={item.icon}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="sidebar-foot">
        <span className="sidebar-hint">single tool registry</span>
      </div>
    </nav>
  );
}
