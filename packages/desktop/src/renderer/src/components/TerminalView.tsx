import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { ToolResult, WorkspaceTab } from "@meith/shared";
import { useEffect, useRef, useState } from "react";
import type { MeithBridge } from "../../../bridge.js";

interface TerminalViewProps {
  /** Persisted workspace tab metadata, including any attached terminal id. */
  tab: WorkspaceTab;
  bridge: MeithBridge;
  call: (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;
}

// Warm, harvest-toned palette matching the app chrome (near-black + amber).
const THEME = {
  background: "#1a1714",
  foreground: "#e8e0d4",
  cursor: "#e0a82e",
  cursorAccent: "#1a1714",
  selectionBackground: "#3f3a32",
  black: "#1a1714",
  red: "#c2503f",
  green: "#5fa67f",
  yellow: "#e0a82e",
  blue: "#3f8fa6",
  magenta: "#a86fb0",
  cyan: "#5fa6a6",
  white: "#e8e0d4",
  brightBlack: "#6b6356",
} as const;

/**
 * An xterm.js-backed terminal bound to a real PTY in the main process (or the
 * simulated shell in browser preview). Lifecycle goes through tool calls
 * (`create_terminal` / `write_terminal` / `resize_terminal` / `kill_terminal`)
 * while live output arrives on the `bridge.terminal` push channel.
 */
export function TerminalView({ tab, bridge, call }: TerminalViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"starting" | "running" | "exited" | "error">(
    "starting",
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily:
        '"JetBrains Mono", "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      theme: THEME,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);

    let terminalId: string | null = tab.terminalId ?? null;
    let disposed = false;
    const offFns: Array<() => void> = [];

    const safeFit = () => {
      try {
        fit.fit();
      } catch {
        /* element not measurable yet */
      }
    };

    // Stream live output for *our* terminal id only.
    offFns.push(
      bridge.terminal.onData(({ id, chunk }) => {
        if (id === terminalId) term.write(chunk);
      }),
    );
    offFns.push(
      bridge.terminal.onExit(({ id, exitCode }) => {
        if (id !== terminalId) return;
        setStatus("exited");
        term.write(`\r\n\x1b[2m[process exited with code ${exitCode}]\x1b[0m\r\n`);
      }),
    );

    // Forward keystrokes to the PTY.
    const dataDisposable = term.onData((data) => {
      if (terminalId) void call("write_terminal", { terminalId, data });
    });

    // Debounced resize -> notify the PTY of the new viewport size.
    let resizeRaf = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        safeFit();
        if (terminalId) {
          void call("resize_terminal", {
            terminalId,
            cols: term.cols,
            rows: term.rows,
          });
        }
      });
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(host);

    // Attach to the persisted PTY if it exists, otherwise create a PTY rooted
    // in the workspace tab cwd and persist the terminal id onto the tab.
    (async () => {
      safeFit();
      if (terminalId) {
        const snapshot = await call("get_terminal_snapshot", { terminalId });
        if (disposed) return;
        if (snapshot.ok) {
          const content = snapshot.content as {
            buffer?: string;
            session?: { status?: string };
          };
          if (content.buffer) term.write(content.buffer);
          setStatus(content.session?.status === "exited" ? "exited" : "running");
          term.focus();
          return;
        }

        // The app was probably restarted and the live PTY no longer exists.
        // Clear the stale binding and create a fresh terminal below.
        terminalId = null;
        await call("set_workspace_tab_terminal", {
          tabId: tab.id,
          terminalId: null,
        });
      }

      const result = await call("create_terminal", {
        cwd: tab.cwd,
        cols: term.cols,
        rows: term.rows,
      });
      if (disposed) return;
      if (!result.ok) {
        setStatus("error");
        term.write(
          `\x1b[31mFailed to start terminal: ${result.error?.message ?? "unknown error"}\x1b[0m\r\n`,
        );
        return;
      }
      const session = result.content as { id?: string; cwd?: string } | undefined;
      terminalId = session?.id ?? null;
      if (terminalId) {
        void call("set_workspace_tab_terminal", {
          tabId: tab.id,
          terminalId,
        });
      }
      setStatus("running");
      term.focus();
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(resizeRaf);
      observer.disconnect();
      dataDisposable.dispose();
      for (const off of offFns) off();
      term.dispose();
    };
  }, [tab.id, bridge, call]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#1a1714]">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">Terminal</span>
        <span
          className="text-[10px] uppercase tracking-wide text-muted-foreground/70"
          data-status={status}
        >
          {status}
        </span>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden p-2" />
    </div>
  );
}
