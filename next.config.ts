import withSerwistInit from "@serwist/next";

const isDev = process.env.NODE_ENV === "development";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: isDev,
});

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss: http://127.0.0.1:54331 ws://127.0.0.1:54331",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "worker-src 'self' blob:",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig = {
  ...(isDev ? { allowedDevOrigins: ["127.0.0.1", "10.0.0.8", "localhost"] } : {}),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          ...(isDev
            ? []
            : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
        ],
      },
    ];
  },
  async rewrites() {
    if (!isDev) return [];
    return [
      {
        source: "/supabase/:path*",
        destination: "http://127.0.0.1:54331/:path*",
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https" as const,
        hostname: "*.s3.amazonaws.com",
      },
      {
        protocol: "https" as const,
        hostname: "*.s3.*.amazonaws.com",
      },
      {
        protocol: "https" as const,
        hostname: "*.cloudfront.net",
      },
      {
        protocol: "https" as const,
        hostname: "cdn.pnutmonster.com",
      },
      {
        protocol: "https" as const,
        hostname: "assets.pnutmonster.com",
      },
      {
        protocol: "https" as const,
        hostname: "assets.pnut.monster",
      },
      {
        protocol: "https" as const,
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withSerwist(nextConfig);
