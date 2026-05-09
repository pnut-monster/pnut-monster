import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig = {
  images: {
    remotePatterns: [
      // AWS S3
      {
        protocol: "https" as const,
        hostname: "*.s3.amazonaws.com",
      },
      {
        protocol: "https" as const,
        hostname: "*.s3.*.amazonaws.com",
      },
      // CloudFront CDN
      {
        protocol: "https" as const,
        hostname: "*.cloudfront.net",
      },
      // Custom CDN domain (update when configured)
      {
        protocol: "https" as const,
        hostname: "cdn.pnutmonster.com",
      },
      {
        protocol: "https" as const,
        hostname: "assets.pnutmonster.com",
      },
      // Supabase Storage (fallback/local dev)
      {
        protocol: "https" as const,
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withSerwist(nextConfig);
