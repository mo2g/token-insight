import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const DEBOUNCE_MS = 500;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 3000;

export function useRefreshStream() {
  const queryClient = useQueryClient();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const connect = () => {
      if (sourceRef.current) {
        sourceRef.current.close();
      }

      sourceRef.current = new EventSource("/api/events/stream");

      sourceRef.current.addEventListener("refresh", () => {
        // Debounce invalidate to prevent rapid successive calls
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: ["overview"] });
          void queryClient.invalidateQueries({ queryKey: ["sources"] });
          void queryClient.invalidateQueries({ queryKey: ["source-status"] });
          // Keep other queries stale for better performance
        }, DEBOUNCE_MS);
      });

      sourceRef.current.addEventListener("error", () => {
        sourceRef.current?.close();
        sourceRef.current = null;

        // Limit reconnection attempts
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          setTimeout(connect, RECONNECT_DELAY_MS);
        }
      });

      sourceRef.current.addEventListener("open", () => {
        reconnectAttemptsRef.current = 0;
      });
    };

    connect();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [queryClient]);
}
