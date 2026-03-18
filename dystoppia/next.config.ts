import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // better-sqlite3 is a native module, only used server-side
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
