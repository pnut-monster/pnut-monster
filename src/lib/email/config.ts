export type EmailBrandConfig = {
  companyName: string;
  brandName: string;
  brandColor: string;
  accentColor: string;
  websiteUrl: string;
  supportEmail: string;
  logoUrl: string;
  privacyUrl: string;
  termsUrl: string;
  contactUrl: string;
  socialInstagramUrl: string;
  socialFacebookUrl: string;
  socialXUrl: string;
  footerText: string;
};

function numberFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const emailConfig = {
  aws: {
    region: process.env.AWS_SES_REGION || process.env.AWS_REGION || "ap-south-1",
    templateRegion:
      process.env.AWS_EMAIL_TEMPLATE_REGION ||
      process.env.AWS_S3_REGION ||
      process.env.AWS_REGION ||
      "ap-south-1",
    templateBucket: process.env.AWS_EMAIL_TEMPLATE_BUCKET || "",
    templatePrefix: (process.env.AWS_EMAIL_TEMPLATE_PREFIX || "email-templates").replace(
      /^\/+|\/+$/g,
      ""
    ),
  },
  sender: {
    email: process.env.SES_FROM_EMAIL || "",
    name: process.env.SES_FROM_NAME || "PNUT Monster",
    replyTo: process.env.SES_REPLY_TO_EMAIL || process.env.EMAIL_SUPPORT_EMAIL || "",
    configurationSet: process.env.SES_CONFIGURATION_SET || "",
  },
  cache: {
    ttlMs: numberFromEnv(process.env.EMAIL_TEMPLATE_CACHE_TTL_SECONDS, 300) * 1000,
    maxEntries: numberFromEnv(process.env.EMAIL_TEMPLATE_CACHE_MAX_ENTRIES, 100),
    allowStaleOnError: process.env.EMAIL_TEMPLATE_ALLOW_STALE_ON_ERROR !== "false",
  },
  brand: {
    companyName: process.env.EMAIL_COMPANY_NAME || "PNUT Monster Foods Private Limited",
    brandName: process.env.EMAIL_BRAND_NAME || "PNUT MONSTER",
    brandColor: process.env.EMAIL_BRAND_COLOR || "#15803d",
    accentColor: process.env.EMAIL_ACCENT_COLOR || "#facc15",
    websiteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://pnut.monster",
    supportEmail: process.env.EMAIL_SUPPORT_EMAIL || "support@pnut.monster",
    logoUrl: process.env.EMAIL_LOGO_URL || "https://pnut.monster/icons/icon-192x192.png",
    privacyUrl: process.env.EMAIL_PRIVACY_URL || "https://pnut.monster/privacy",
    termsUrl: process.env.EMAIL_TERMS_URL || "https://pnut.monster/terms",
    contactUrl: process.env.EMAIL_CONTACT_URL || "https://pnut.monster/contact",
    socialInstagramUrl: process.env.EMAIL_INSTAGRAM_URL || "https://instagram.com/pnutmonster",
    socialFacebookUrl: process.env.EMAIL_FACEBOOK_URL || "https://facebook.com/pnutmonster",
    socialXUrl: process.env.EMAIL_X_URL || "https://x.com/pnutmonster",
    footerText: process.env.EMAIL_FOOTER_TEXT || "Healthy food, made monstrously delicious.",
  } satisfies EmailBrandConfig,
} as const;

export function isEmailInfrastructureConfigured() {
  return Boolean(
    emailConfig.aws.templateBucket &&
      emailConfig.sender.email &&
      (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI)
  );
}

