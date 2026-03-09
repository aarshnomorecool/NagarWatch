/** @type {import('next').NextConfig} */
module.exports = {
  webpack: (config, { dev }) => {
    // Keep conservative dev caching to avoid intermittent cache corruption.
    if (dev) {
      config.cache = false;
    }

    return config;
  },
};
