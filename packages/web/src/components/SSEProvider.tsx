import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Mantém uma ligação SSE ao servidor para receber actualizações em tempo real.
 * O token é passado via query param porque o EventSource não suporta headers custom.
 */
export function SSEProvider() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem("mittens_token");
    if (!token) return;

    const src = new EventSource(`/api/sse?token=${encodeURIComponent(token)}`);

    src.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.type === "new_message") {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          queryClient.invalidateQueries({ queryKey: ["conversation", data.conversationId] });
        }

        if (data.type === "new_lead" || data.type === "lead_updated") {
          queryClient.invalidateQueries({ queryKey: ["leads"] });
          queryClient.invalidateQueries({ queryKey: ["stats"] });
          if (data.leadId) {
            queryClient.invalidateQueries({ queryKey: ["lead", data.leadId] });
          }
        }
      } catch {
        // ignore
      }
    };

    return () => src.close();
  }, [queryClient]);

  return null;
}
