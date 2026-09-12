const backend = process.env.TRADELAB_BACKEND_URL;
if (backend && !/^https?:\/\//.test(backend))
  throw new Error("TRADELAB_BACKEND_URL must be an HTTP(S) URL.");
/** @type {import("next").NextConfig} */
const config = {
  distDir: ".tradelab-build",
  outputFileTracingExcludes: {
    "*": [
      "./.next/**/*",
      "./.venv/**/*",
      "./data/**/*",
      "./db/**/*",
      "./test-results/**/*",
    ],
  },
  serverExternalPackages: ["@clickhouse/client"],
  // Put external API rewrites before filesystem routes for an optional Vercel frontend.
  async rewrites() {
    return {
      beforeFiles: backend
        ? [
            {
              source: "/api/:path*",
              destination: `${backend.replace(/\/$/, "")}/api/:path*`,
            },
          ]
        : [],
      afterFiles: [],
      fallback: [],
    };
  },
};
export default config;
