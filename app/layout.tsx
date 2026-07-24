import "./globals.css";
import type { Metadata, Viewport } from "next";
import { PwaProvider } from "@/components/PwaProvider";
import { InstallBanner } from "@/components/InstallBanner";

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
      <body className="antialiased">
        <PwaProvider>
          {children}
          <InstallBanner />
        </PwaProvider>
      </body>
    </html>
  );
}
