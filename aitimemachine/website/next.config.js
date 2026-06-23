/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['three'],
  // Keep builds resilient in minimal environments; CI can run a dedicated lint job.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
