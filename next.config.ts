import type { NextConfig } from 'next';

// Import proxy setup
import './next.config.proxy.js';

const nextConfig: NextConfig = {
  outputFileTracingRoot: '/home/yoshinaka/devel/Asset-Integration',
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
