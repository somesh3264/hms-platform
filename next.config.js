/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emits a self-contained .next/standalone build (server + only the
  // node_modules it actually needs) instead of a build that assumes a full
  // `npm install` sits alongside it -- what the production Dockerfile below
  // copies into the runtime image. No effect on `npm run dev`.
  output: 'standalone',
};

module.exports = nextConfig;
