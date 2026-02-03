import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Turbopack root ayarı - Türkçe karakterli path sorunu için
  turbopack: {
    root: 'c:\\Users\\SENFONİ-Berkan\\Desktop\\Yazılım\\bilyonerv2\\bilyoner-assistant',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'media.api-sports.io',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'media-*.api-sports.io',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
