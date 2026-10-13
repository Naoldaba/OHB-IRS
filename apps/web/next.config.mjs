/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @ohb/shared is a workspace package compiled to dist; transpile it so Next
  // bundles it consistently for both server and client components.
  transpilePackages: ['@ohb/shared'],
  // This app has no standalone ESLint config yet; don't fail the build on it.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
