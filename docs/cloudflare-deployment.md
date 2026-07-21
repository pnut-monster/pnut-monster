# Cloudflare Workers Deployment

PNUT Monster uses Next.js middleware and route handlers, so deploy it as a
Cloudflare Worker with OpenNext. Do not configure it as a static Pages export.

## Cloudflare Git build

Connect `pnut-monster/pnut-monster` in **Workers & Pages > Create > Import a
repository** and use:

- Worker name: `pnut-monster`
- Production branch: `main`
- Build command: `npm run build:cloudflare`
- Deploy command: `npx wrangler deploy`
- Node version: `22`

The Worker entry point and compatibility settings are defined in
`wrangler.jsonc`.

## Environment variables

Configure these in Cloudflare for both the build and Worker runtime. Use the
real values from the existing production services; never commit them.

Public/build variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- `NEXT_PUBLIC_CDN_URL` (optional)

Runtime secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `AWS_S3_BUCKET`
- `AWS_S3_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SES_REGION`
- `SES_FROM_EMAIL`
- `SES_FROM_NAME`

Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS origin with no trailing slash.
For an initial Worker URL, use `https://pnut-monster.<account-subdomain>.workers.dev`
and update it after attaching a custom domain.

## External service updates

After the first deployment:

1. In Supabase Auth URL Configuration, set the Site URL to the production URL.
2. Add `<production-url>/auth/callback` to Supabase Redirect URLs.
3. Add the production domain to the Google OAuth authorized JavaScript origins.
4. Add the Supabase callback URL shown by Supabase to Google OAuth authorized
   redirect URIs.
5. If the domain changes, update `NEXT_PUBLIC_SITE_URL` and redeploy.

## Verification

Verify `/`, `/login`, `/admin/login`, and `/restaurant/login`, then test a
customer login and the protected route redirects. Payment tests must use the
matching Razorpay mode and keys.

The `/api/upload` route is Workers-compatible: the browser resizes/converts
shared UI uploads to WebP and the API validates actual file signatures before
S3 storage. Configure `AWS_S3_BUCKET`, `AWS_S3_REGION`, and AWS credentials as
Worker secrets; production intentionally has no data-URL fallback.
