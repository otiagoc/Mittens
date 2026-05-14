import { useEffect, useState, useCallback } from "react";

type PushState = "unsupported" | "denied" | "granted" | "default" | "loading";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function saveToServer(subscription: PushSubscription, clearOld = false): Promise<boolean> {
  const sub = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  const token = localStorage.getItem("mittens_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  try {
    // Apagar subscrições antigas se pedido (reactivação)
    if (clearOld) {
      await fetch("/api/push/subscriptions", { method: "DELETE", headers });
    }
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers,
      body: JSON.stringify(sub),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState<string | null>(null);

  // Ao arrancar: verifica se já há subscrição activa no browser e re-envia ao servidor
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    if (Notification.permission === "default") {
      setState("default");
      return;
    }

    // Permissão já dada — verificar se existe subscrição activa e re-enviar ao servidor
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          // Re-envia silenciosamente para garantir que está na DB
          await saveToServer(existing);
          setState("granted");
        } else {
          // Permissão dada mas sem subscrição — pedir para reactivar
          setState("default");
        }
      } catch {
        setState(Notification.permission as PushState);
      }
    })();
  }, []);

  const subscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    setState("loading");
    setError(null);
    try {
      // 1. Registar SW
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // 2. Obter VAPID public key
      const vapidRes = await fetch("/api/push/vapid-key");
      const { publicKey } = await vapidRes.json() as { publicKey: string };
      if (!publicKey) throw new Error("VAPID key não disponível.");

      // 3. SEMPRE apagar subscrição antiga antes de criar nova
      //    Garante que o iOS mostra o popup nativo e cria endpoint fresco
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      // 4. Criar subscrição nova (iOS mostra popup se precisar de permissão)
      const appKey = urlBase64ToUint8Array(publicKey);
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        applicationServerKey: appKey as any,
      });

      // 5. Guardar no servidor (limpa antiga se existia)
      const saved = await saveToServer(subscription, !!existing);
      if (!saved) throw new Error("Não foi possível guardar a subscrição. Tenta novamente.");

      setState("granted");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("denied") || Notification.permission === "denied") {
        setState("denied");
        setError("Permissão bloqueada. Em Definições iPhone → Notificações → procura o site e activa.");
      } else {
        setState(Notification.permission as PushState);
        setError(msg);
      }
    }
  }, []);

  return { state, error, subscribe };
}
