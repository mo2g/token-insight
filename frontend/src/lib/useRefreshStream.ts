import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useRefreshStream() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/events/stream");
    source.addEventListener("refresh", () => {
      void queryClient.invalidateQueries();
    });
    return () => source.close();
  }, [queryClient]);
}
