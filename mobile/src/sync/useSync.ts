import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { Store } from "../../../src/mobile/store/types";
import { catchUp } from "../../../src/mobile/sync/catchup";
import { replayAll } from "../../../src/mobile/sync/replay";
import { remote } from "./remote";

export type SyncReport = { sent: number; conflicted: number; failed: number; pulled: number; dropped: number };

export type SyncState = {
  running: boolean;
  error: string | null;
  last: SyncReport | null;
  sync: () => Promise<void>;
};

/**
 * Send first, then pull. The order is the whole point: catching up first would overwrite the
 * rows the queue still owns, and although `catchUp` refuses to touch those, draining the
 * queue first means there are fewer of them and the cook sees their own work land before
 * anyone else's.
 */
export function useSync(store: Store): SyncState {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<SyncReport | null>(null);
  // A ref, not the state, because two syncs starting in the same tick would both read
  // `running` as false. Launch and the first foreground event can be that close together.
  const busy = useRef(false);

  const sync = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    setError(null);
    try {
      const sentReport = await replayAll(store, remote);
      const pull = await catchUp(store, remote, new Date());
      setLast({ ...sentReport, pulled: pull.pulled, dropped: pull.dropped });
    } catch (thrown) {
      // Offline is the ordinary case, not an exception worth shouting about. The message is
      // kept for a screen to show quietly; nothing here retries, because the next
      // foreground is the retry.
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      busy.current = false;
      setRunning(false);
    }
  }, [store]);

  useEffect(() => {
    void sync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync();
    });
    return () => subscription.remove();
  }, [sync]);

  return { running, error, last, sync };
}
