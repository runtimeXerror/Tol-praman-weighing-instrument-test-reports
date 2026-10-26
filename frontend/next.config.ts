import path from "node:path";
import type { NextConfig } from "next";

const backend = process.env.BACKEND_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Shared TypeScript workspaces (engine + rule packs) are compiled by Next directly.
  transpilePackages: ["@tolpraman/engine", "@tolpraman/rulepacks"],
  // The browser talks to the backend through this same origin: no CORS, one URL to deploy.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  output: "standalone",
  // Monorepo: trace files from the repo root so shared/ is included in the standalone build.
  outputFileTracingRoot: path.join(__dirname, ".."),
  poweredByHeader: false,
  // Hide the floating dev-mode badge (it covered the sidebar's logout button).
  devIndicators: false,
};

export default nextConfig;
