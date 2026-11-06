import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright must run as a normal Node module, not bundled.
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
