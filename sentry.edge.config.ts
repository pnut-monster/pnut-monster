// Edge Sentry disabled to stay within Cloudflare Workers free tier size limit.
// Errors are captured via Cloudflare observability (wrangler.jsonc: observability.enabled).
// Client-side error tracking remains active via sentry.client.config.ts.
export {};
