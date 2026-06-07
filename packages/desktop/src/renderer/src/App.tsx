import type { AppState } from "@meith/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { getBridge } from "./bridge";
import { LogsPanel } from "./components/LogsPanel";
import { Sidebar } from "./components/Sidebar";
import { StatePanel } from "./components/StatePanel";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import { ToolsPanel } from "./components/ToolsPanel";

export type View = "tools" | "state" | "logs";

export function App() {
  // Resolve the bridge exactly once: the mock keeps its own in-memory state.
  const { bridge, isMock } = useMemo(() => getBridge(), []);
  const [view, setView] = useState<View>("tools");
  const [state, setState] = useState<AppState | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let mounted = true;
    bridge.state
      .get()
      .then((s) => mounted && setState(s))
      .catch(() => undefined);
    const off = bridge.state.onChange((s) => setState(s));
    return () => {
      mounted = false;
      off();
    };
  }, [bridge]);

  // Report the measured browser content region to the main process so the
  // native browser view is sized to the real layout (not a hard-coded inset).
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      bridge.browser.setViewport({
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    window.addEventListener("resize", report);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", report);
    };
  }, [bridge]);

  const activeSpace =
    state?.spaces.find((s) => s.id === state.activeSpaceId) ?? state?.spaces[0] ?? null;

  return (
    <div className="app-shell">
      <TitleBar spaceName={activeSpace?.name ?? null} isMock={isMock} />
      <div className="app-body">
        <Sidebar view={view} onViewChange={setView} />
        <main className="app-main" ref={mainRef}>
          {view === "tools" && <ToolsPanel bridge={bridge} />}
          {view === "state" && <StatePanel state={state} />}
          {view === "logs" && <LogsPanel bridge={bridge} />}
        </main>
      </div>
      <StatusBar
        isMock={isMock}
        browserTabs={state?.browserTabs.length ?? 0}
        workspaceTabs={state?.workspaceTabs.length ?? 0}
        view={view}
      />
    </div>
  );
}
