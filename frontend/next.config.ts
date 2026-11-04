import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export embeds the same interface into the standalone Android WebView.
  output: process.env.ANDROID_BUILD === '1' ? 'export' : 'standalone',
};

export default nextConfig;
