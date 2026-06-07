/** @type {import('next').NextConfig} */
const nextConfig = {
  // The catalog package ships raw TypeScript (exports ./src/index.ts), so let
  // Next compile it as part of the app build.
  transpilePackages: ["@ai-battle/catalog"],
};

export default nextConfig;
