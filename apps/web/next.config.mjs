/** @type {import('next').NextConfig} */
const nextConfig = {
  // These workspace packages ship raw TypeScript, so let Next compile them.
  transpilePackages: [
    "@ai-battle/catalog",
    "@ai-battle/db",
    "@ai-battle/engine",
    "@ai-battle/models",
  ],
  // Keep these out of the server bundle — Prisma needs its engine files at
  // runtime, and the OpenAI SDK is imported lazily by the model adapters.
  serverExternalPackages: ["@prisma/client", "prisma", "openai"],
};

export default nextConfig;
