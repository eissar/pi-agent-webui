import { useSyncExternalStore } from "react";
import { getConnectionSnapshot, subscribeConnection, type ConnectionSnapshot } from "@/lib/api-client";

export function useConnectionStatus(): ConnectionSnapshot {
  return useSyncExternalStore(subscribeConnection, getConnectionSnapshot, getConnectionSnapshot);
}
