import "./globals.css";
import type { Metadata, Viewport } from "next";
import { PwaProvider } from "@/components/PwaProvider";
import { InstallBanner } from "@/components/InstallBanner";
import { SplashScreen } from "@/components/SplashScreen";
import { UpdateNotification } from "@/components/UpdateNotification";

const APP_NAME = "Chat";
const APP_DEFAULT_TITLE = "Chat";
const APP_DESCRIPTION = "A simple, beautiful chat application";

export const metadata: Metadata = {
  title: {
    default: APP_DEFAULT_TITLE,
    template: "%s | Chat",
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_DEFAULT_TITLE,
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  manifest: "/manifest.webmanifest",
  icons: {
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_DEFAULT_TITLE,
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: APP_DEFAULT_TITLE,
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0a0a0c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <link
          rel="apple-touch-startup-image"
          href="/icons/icon-512x512.png"
          media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)"
        />
      </head>
      <body className="antialiased">
        <PwaProvider>
          <SplashScreen />
          <UpdateNotification />
          {children}
          <InstallBanner />
        </PwaProvider>
      </body>
    </html>
  );
}
