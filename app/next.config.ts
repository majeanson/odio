import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native binaries with dynamic require() — must not be bundled.
  // @ffmpeg-installer/ffmpeg resolves platform-specific binary paths at
  // runtime; Turbopack can't statically trace those requires.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "fluent-ffmpeg"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://marc-portal.pages.dev https://*.marc-portal.pages.dev",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
