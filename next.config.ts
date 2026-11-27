import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  typescript: { ignoreBuildErrors: false },
  // keep the embedded-Postgres fallback working on serverless hosts when no DATABASE_URL is set
  outputFileTracingIncludes: { "/api/[...path]": ["./node_modules/@electric-sql/pglite/dist/pglite.wasm", "./node_modules/@electric-sql/pglite/dist/pglite.data", "./node_modules/@electric-sql/pglite/dist/initdb.wasm"] },
};
export default nextConfig;
