import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Installed PWA icons (iOS "Add to Home Screen") cache the HTML shell very
  // aggressively and have no manual reload option, so without this header a
  // deploy can go unnoticed indefinitely on an installed icon. Hashed
  // /_next/static assets are left alone - those are safe to cache forever
  // since their filename changes on every build.
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
