import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile in a parent folder is never picked up.
  turbopack: { root: import.meta.dirname },
  // These run only on the server and must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite', '@react-pdf/renderer', 'pg'],
  experimental: {
    // CSV imports travel through a server action; the import limit is 5 MB.
    serverActions: { bodySizeLimit: '6mb' },
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // Shared reports are capability URLs: never index them or leak them via Referer.
        source: '/share/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
