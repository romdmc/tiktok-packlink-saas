/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // URL of the API service.  In production you should set NEXT_PUBLIC_API_URL to your Render API URL.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
  }
};

module.exports = nextConfig;
