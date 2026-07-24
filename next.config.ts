import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['duckdb'],
  turbopack: {
    resolveAlias: {
      duckdb: 'duckdb',
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'duckdb'];
    }
    return config;
  },
};

export default nextConfig;