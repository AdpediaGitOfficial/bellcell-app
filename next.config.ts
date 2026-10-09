import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,

  /**
   * Ship a self-contained server directory.
   *
   * `node_modules` for this project is ~980MB; the traced standalone output
   * is ~110MB and is what gets copied to the host. The project
   * runs on plain Node 22 with no container, so the deployment artefact
   * being a directory of files rather than an image is the point.
   */
  output: 'standalone',

  /**
   * Prisma's query engine is a native binary loaded at runtime, so Next's
   * static tracing does not always see it. Name it explicitly or the
   * standalone server starts and then fails on its first query.
   */
  outputFileTracingIncludes: {
    '/**': ['./node_modules/.prisma/client/*.node'],
  },
  experimental: {
    // Server Actions carry the write path for every module; keep the body
    // limit generous enough for bulk lead CSV uploads.
    serverActions: { bodySizeLimit: '8mb' },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
