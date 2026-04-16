import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native binaries with dynamic require() — must not be bundled.
  // @ffmpeg-installer/ffmpeg resolves platform-specific binary paths at
  // runtime; Turbopack can't statically trace those requires.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "fluent-ffmpeg"],
  async redirects() {
    return [
      // Redirect /lac → /lac/ so relative links inside the static hub resolve correctly.
      { source: "/lac", destination: "/lac/", permanent: false },
    ];
  },
};

export default nextConfig;
