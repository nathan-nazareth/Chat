import webpush, { type PushSubscription } from "web-push";
import { getPushSubscriptions } from "@/lib/db";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;
  webpush.setVapidDetails(
    "mailto:noreply@chat.app",
    publicKey,
    privateKey
  );
  configured = true;
}

export async function sendPushNotification(
  userId: number,
  payload: {
    title: string;
    body: string;
    conversationId?: number;
    peerName?: string;
  }
): Promise<void> {
  ensureConfigured();
  if (!configured) return;

  const subs = await getPushSubscriptions(userId);
  if (subs.length === 0) return;

  const message = JSON.stringify(payload);

  await Promise.allSettled(
    subs.map(async (sub) => {
      const subscription: PushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(subscription, message);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        // 404/410 = subscription expired/gone — it will be cleaned up on
        // the client's next sync. Don't throw; just skip.
        if (status === 404 || status === 410) return;
        console.error("[push] sendNotification failed:", err);
      }
    })
  );
}
