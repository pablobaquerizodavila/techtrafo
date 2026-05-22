/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  eslint: {
    // En desarrollo no fallar el build por lint warnings; se valida con `npm run lint`
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
