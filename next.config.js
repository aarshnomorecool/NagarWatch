const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

module.exports = (phase) => {
  const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;

  /** @type {import('next').NextConfig} */
  const nextConfig = {
    // Keep dev artifacts separate so `next build` cannot corrupt running `next dev` output.
    distDir: isDevServer ? ".next-dev" : ".next",
    webpack: (config, { dev }) => {
      // Prevent intermittent dev-time chunk/cache corruption in this environment.
      if (dev) {
        config.cache = false;
      }

      return config;
    },
  };

  return nextConfig;
};
