import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer uses Node APIs; keep it out of the server bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
