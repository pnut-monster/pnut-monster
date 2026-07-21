# AWS SES + S3 Email Service

## Architecture

Application code calls `sendTemplateEmail()` with a template name and data. The
service loads private HTML from S3, caches it in each runtime instance, validates
required values, HTML-escapes normal placeholders, renders subject/HTML/text,
and sends through SES.

The registry is `src/lib/email/registry.ts`. S3 is the runtime source of truth.
`email-templates/` contains deployable assets; the upload command publishes 26
distinct keys. Standard message types share a source design but remain separate
S3 objects so each can later be replaced independently.

## AWS setup

1. In SES `ap-south-1`, verify `pnut.monster` as an identity.
2. Add the three Easy DKIM CNAME records shown by SES to Route53/DNS.
3. Configure a custom MAIL FROM domain such as `mail.pnut.monster`, including
   its MX and SPF TXT records. Add DMARC at `_dmarc.pnut.monster`, initially with
   `v=DMARC1; p=none; rua=mailto:dmarc@pnut.monster`, then move toward
   quarantine/reject after monitoring.
4. Request SES production access if the account is in the sandbox. Create an SES
   configuration set with delivery, bounce, complaint, and reject events routed
   to CloudWatch/SNS/EventBridge.
5. Create a private, versioned S3 bucket with public access blocked, encryption
   enabled, and lifecycle rules for noncurrent versions.
6. Use an IAM role/workload identity in production. Static access keys are only
   a local-development fallback supported by the AWS SDK credential chain.

CloudFront is useful for public brand images, but must not expose the private
template bucket.

## Least-privilege runtime IAM

Replace the placeholders:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadEmailTemplates",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::YOUR_TEMPLATE_BUCKET/email-templates/*"
    },
    {
      "Sid": "SendTransactionalEmail",
      "Effect": "Allow",
      "Action": ["ses:SendEmail"],
      "Resource": "arn:aws:ses:ap-south-1:ACCOUNT_ID:identity/pnut.monster"
    }
  ]
}
```

The deployment identity additionally needs `s3:PutObject` only for
`email-templates/*`. Do not grant that permission to the application runtime.

## Configure and publish

Set the variables documented in `.env.example`, then run:

```powershell
npm run email:templates:validate
npm run email:templates:upload
```

The uploader sets UTF-8 HTML content type, AES-256 server-side encryption, and
a SHA-256 metadata checksum.

## Sending

```ts
await sendTemplateEmail({
  template: "otp-verification",
  to: user.email,
  data: {
    userName: user.name,
    otp: "123456",
    expiryTime: "10 minutes"
  },
  tags: { flow: "signup" }
});
```

Use `{{variable}}` for ordinary values; these are HTML-escaped. Triple braces
are rejected unless the registry explicitly permits that variable. Only
server-generated, already-escaped markup such as order rows should be raw.

## Caching and invalidation

Templates use a bounded per-instance memory cache. Configure TTL and stale-on-S3
failure behavior with environment variables. Admins can use:

- `GET /api/admin/email/templates/cache`
- `POST /api/admin/email/templates/cache` with `{}` for all or
  `{ "template": "welcome" }` for one key.

In serverless deployments, endpoint invalidation affects only the instance that
handles it. Use a short TTL for routine updates. For immediate fleet-wide
rollout, upload to a new prefix such as `email-templates/v2` and deploy the new
`AWS_EMAIL_TEMPLATE_PREFIX` atomically.

## Operations

- Monitor sends, rejects, bounces, complaints, delivery latency, and SES account
  reputation. Enable account-level suppression.
- Enforce marketing consent/preferences before sending announcement emails.
- Never log OTPs, magic/reset links, recipient lists, or rendered bodies.
- Test Gmail, Outlook, Apple Mail, and mobile rendering before major releases.
