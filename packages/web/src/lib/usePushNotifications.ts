import { useEffect, useState } from "react";

type PushState = "unsupported" | "denied" | "granted" | "default" | "loading";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    setState(Notification.permission as PushState);
  }, []);

  async function subscribe() {
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
      if (!publicKey) throw new Error("VAPID key não disponível");

      // 3. Subscrever no PushManager
      const appKey = urlBase64ToUint8Array(publicKey);
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        applicationServerKey: appKey as any,
      });

      // 4. Enviar subscrição ao servidor
      const sub = subscription.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      const token = localStorage.getItem("mittens_token");
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(sub),
      });

      setState("granted");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("denied") || Notification.permission === "denied") {
        setState("denied");
        setError("Permissão bloqueada. Vai às definições do browser para permitir.");
      } else {
        setState(Notification.permission as PushState);
        setError(msg);
      }
    }
  }

  return { state, error, subscribe };
}
