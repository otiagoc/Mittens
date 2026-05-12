/**
 * Web Push notifications — envia notificações nativas ao browser/iPhone.
 * Usa VAPID para autenticação sem servidor de push próprio.
 */

import webpush from "web-push";
import { db } from "../db/client.js";
import { pushSubscriptions } from "../db/schema.js";

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_EMAIL   = process.env.VAPID_EMAIL ?? "mailto:admin@mittens.pt";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

export { VAPID_PUBLIC };

export async function saveSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const id = `push_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await db.insert(pushSubscriptions).values({
    id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
  }).onConflictDoNothing();
}

export async function sendPushToAll(payload: {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn("[Push] VAPID keys não configuradas — notificações push desativadas.");
    return;
  }

  const subs = await db.select().from(pushSubscriptions);
  if (subs.length === 0) return;

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/imoveis",
    icon: "/icon-192.png",
    badge: "/icon-72.png",
  });

  const results = await Promise.allSettled(
    subs.map((s: { endpoint: string; p256dh: string; auth: string }) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        data,
      )
    )
  );

  const failed = results.filter((r: PromiseSettledResult<unknown>) => r.status === "rejected");
  if (failed.length > 0) {
    console.warn(`[Push] ${failed.length}/${subs.length} notificações falharam`);
  } else {
    console.log(`[Push] ${subs.length} notificação(ões) enviada(s)`);
  }
}
