const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@flow/shared"],
};

module.exports = nextConfig;
