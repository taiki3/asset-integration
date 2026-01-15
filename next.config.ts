import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output for Docker - enable only in CI/Docker builds
  output: process.env.STANDALONE === 'true' ? 'standalone' : undefined,

  // Disable source maps in production for faster builds
  productionBrowserSourceMaps: false,

  // Skip linting during build (run separately in CI for faster deploys)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Skip TypeScript errors during build (run typecheck separately)
  typescript: {
    ignoreBuildErrors: true,
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },

  // Optimize large icon libraries - tree-shake unused icons
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
    },
  },

  // SWC compiler optimizations
  compiler: {
    // Remove console.log in production (keep errors/warnings)
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },
};

export default nextConfig;
