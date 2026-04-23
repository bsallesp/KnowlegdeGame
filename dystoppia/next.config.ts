import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: [
    "pg",
    "@prisma/adapter-pg",
    "applicationinsights",
    "pdfjs-dist",
    "yauzl",
  ],
};

export default nextConfig;
