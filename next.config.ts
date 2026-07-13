import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker/Fly deploys
  output: "standalone",
  // The app reads its datasets and snapshots via fs at runtime, which
  // Next's dependency tracing can't see — include them explicitly so the
  // standalone bundle ships them.
  outputFileTracingIncludes: {
    "/**": ["./src/lib/data/**/*"],
  },
};

export default nextConfig;
