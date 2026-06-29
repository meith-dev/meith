import { useEffect, useState } from "react";

/**
 * Returns a wall-clock timestamp that updates on an interval so relative labels
 * ("just now", "2 minutes ago") stay fresh without relying on unrelated UI
 * updates.
 */
export function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
