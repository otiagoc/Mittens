/**
 * SSE broadcaster — envia eventos em tempo real para o dashboard.
 * Usa Set de WritableStreamDefaultWriter para manter ligações abertas.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SSEClient = (data: any) => void;
const clients = new Set<SSEClient>();

/** Regista um novo cliente SSE */
export function addSSEClient(send: SSEClient) {
  clients.add(send);
  console.log(`[SSE] Cliente ligado. Total: ${clients.size}`);
}

/** Remove um cliente SSE (quando a ligação fecha) */
export function removeSSEClient(send: SSEClient) {
  clients.delete(send);
  console.log(`[SSE] Cliente desligado. Total: ${clients.size}`);
}

/** Envia um evento para todos os clientes ligados */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sseBroadcast(data: any) {
  if (clients.size === 0) return;
  const payload = JSON.stringify(data);
  for (const send of clients) {
    try {
      send(payload);
    } catch {
      clients.delete(send);
    }
  }
}
