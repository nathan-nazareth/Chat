/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3", "sib-api-v3-sdk"],
  },
};
module.exports = nextConfig;