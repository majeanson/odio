import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native binaries with dynamic require() — must not be bundled.
  // @ffmpeg-installer/ffmpeg resolves platform-specific binary paths at
  // runtime; Turbopack can't statically trace those requires.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "fluent-ffmpeg"],
  // Bundle lac-views/ HTML files with the /lac/* Lambda so they're
  // readable at runtime via fs.readFile (not served from public/).
  outputFileTracingIncludes: {
    "/lac/**": ["./lac-views/**"],
  },
};

export default nextConfig;
