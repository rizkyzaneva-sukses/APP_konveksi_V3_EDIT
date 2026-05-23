import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // Build akan tetap jalan meskipun ada TS error
    // (untuk deployment, TS check dilakukan terpisah)
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
