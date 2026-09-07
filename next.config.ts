import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "ioredis", "bs58"],
  experimental: {},
};

export default nextConfig;
