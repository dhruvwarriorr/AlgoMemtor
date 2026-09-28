import path from 'node:path'

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The shared contracts package is a workspace dependency; Turbopack must
  // watch and resolve from the monorepo root.
  turbopack: {
    root: path.join(import.meta.dirname, '../..'),
    rules: {
      // The visualizer's Python tracer is imported as source text.
      '*.py': { type: 'raw' },
    },
  },
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // The Prisma query compiler and the pg driver stay out of the bundle.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],
  headers() {
    return Promise.resolve([
      {
        // Pyodide runtime files are versioned by path and never change.
        source: '/pyodide/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ])
  },
}

export default nextConfig
