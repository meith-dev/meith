import type { DevServer, ProcessLogEntry } from "@meith/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MeithBridge } from "../../../bridge";

/** Cap the in-memory per-server log buffer so previews/long runs stay bounded. */
const MAX_LOG_LINES = 2_000;

export interface DevServerLogLine extends ProcessLogEntry {
  id: string;
}

/**
 * Subscribes to the dedicated dev-server IPC channel: keeps the live server
 * list and a capped, per-server log buffer in sync. This deliberately lives
 * outside the persisted AppState (dev servers are ephemeral process state).
 */
export function useDevServers(bridge: MeithBridge) {
  const [servers, setServers] = useState<DevServer[]>([]);
  const [logs, setLogs] = useState<Record<string, DevServerLogLine[]>>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    bridge.devServers
      .get()
      .then((list) => mountedRef.current && setServers(list))
      .catch(() => undefined);

    const offChange = bridge.devServers.onChange((list) => {
      if (mountedRef.current) setServers(list);
    });
    const offLog = bridge.devServers.onLog(({ id, entry }) => {
      if (!mountedRef.current) return;
      setLogs((prev) => {
        const next = [...(prev[id] ?? []), { ...entry, id }];
        if (next.length > MAX_LOG_LINES) next.splice(0, next.length - MAX_LOG_LINES);
        return { ...prev, [id]: next };
      });
    });
    return () => {
      mountedRef.current = false;
      offChange();
      offLog();
    };
  }, [bridge]);

  /** Live servers whose cwd matches a project (servers are keyed by cwd). */
  const serversForCwd = useCallback(
    (cwd: string | undefined): DevServer[] =>
      cwd ? servers.filter((s) => s.cwd === cwd) : [],
    [servers],
  );

  const logsForServer = useCallback(
    (id: string): DevServerLogLine[] => logs[id] ?? [],
    [logs],
  );

  /** Servers that are actively starting/running (vs. exited/stopped/errored). */
  const runningServers = useMemo(
    () => servers.filter((s) => s.status === "starting" || s.status === "running"),
    [servers],
  );

  return { servers, runningServers, serversForCwd, logsForServer };
}

export type DevServers = ReturnType<typeof useDevServers>;
