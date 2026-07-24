import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
  title: string;
  body: string;
  conversationId?: number;
  peerName?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  let payload: PushPayload;
  try {
    payload = event.data?.json() ?? { title: "Chat", body: "New message" };
  } catch {
    payload = { title: "Chat", body: event.data?.text() ?? "New message" };
  }

  const opts: NotificationOptions & { vibrate?: number[] } = {
    body: payload.body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: payload.conversationId ? `conv-${payload.conversationId}` : undefined,
    data: {
      conversationId: payload.conversationId,
      peerName: payload.peerName,
    },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(payload.title, opts));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId;

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of all) {
        if (client.url.includes(self.registration.scope)) {
          if ("focus" in client) await client.focus();
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(self.registration.scope);
      }
    })()
  );
});

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
      method: "GET",
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
