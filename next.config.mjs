import { spawnSync } from "node:child_process";
import withSerwistInit from "@serwist/next";

// A revision ties the precached offline fallback page to the current build.
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim() ||
  Date.now().toString();

const withSerwist = withSerwistInit({
  // Precache the offline fallback so navigation failures still show the shell.
  additionalPrecacheEntries: [{ url: "/offline", revision }],
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  register: false, // we register manually for full control over install UX
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@libsql/client"],
  },
};

export default withSerwist(nextConfig);
