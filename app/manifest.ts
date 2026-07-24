import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Chat",
    short_name: "Chat",
    description: "A simple, beautiful chat application",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#0a0a0c",
    theme_color: "#0a0a0c",
    categories: ["social", "communication", "productivity"],
    lang: "en",
    dir: "ltr",
    prefer_related_applications: false,
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcuts: [
      {
        name: "New chat",
        short_name: "New",
        description: "Start a new conversation",
        url: "/?action=new",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
    ],
    share_target: {
      action: "/share",
      method: "post",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
      } as any,
    },
  };
}
