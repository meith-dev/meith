import type { AppState, ToolResult } from "@meith/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBridge } from "../bridge";

export type ConnState = "connecting" | "ready" | "error";

/**
 * Central renderer state: resolves the bridge once, tracks the live AppState,
 * connection status, and exposes a typed `call` helper for tool invocations.
 *
 * Tool calls that mutate state don't need manual refetching — the main process
 * (and the mock) push a new AppState through `state.onChange`.
 */
export function useWorkbench() {
  const { bridge, isMock } = useMemo(() => getBridge(), []);
  const [state, setState] = useState<AppState | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    bridge.state
      .get()
      .then((s) => {
        if (!mountedRef.current) return;
        setState(s);
        setConn("ready");
      })
      .catch(() => mountedRef.current && setConn("error"));
    const off = bridge.state.onChange((s) => {
      if (!mountedRef.current) return;
      setState(s);
      setConn("ready");
    });
    return () => {
      mountedRef.current = false;
      off();
    };
  }, [bridge]);

  const call = useCallback(
    (name: string, args?: Record<string, unknown>): Promise<ToolResult> =>
      bridge.tools.call(name, args),
    [bridge],
  );

  return { bridge, isMock, state, conn, call };
}

export type Workbench = ReturnType<typeof useWorkbench>;
