import type { TemplateVariables } from "./renderer";

export const EMAIL_TEMPLATE_NAMES = [
  "otp-verification", "email-verification", "welcome", "password-reset",
  "login-alert", "security-alert", "invite-user", "organization-invite",
  "magic-link-login", "account-approved", "account-rejected",
  "subscription-activated", "subscription-expiring", "subscription-expired",
  "invoice", "payment-successful", "payment-failed", "refund-initiated",
  "refund-completed", "notification", "contact-auto-reply",
  "support-ticket-created", "support-ticket-closed", "announcement",
  "order-confirmation", "wallet-topup",
] as const;

export type EmailTemplateName = (typeof EMAIL_TEMPLATE_NAMES)[number];

type TemplateDefinition = {
  key: string;
  subject: string;
  text: string;
  required: readonly string[];
  rawVariables?: readonly string[];
};

const standard = (key: EmailTemplateName, subject: string): TemplateDefinition => ({
  key: `${key}.html`,
  subject,
  text: "{{heading}}\n\n{{message}}\n\n{{buttonText}}: {{buttonUrl}}\n\nNeed help? {{supportEmail}}",
  required: ["userName", "heading", "message", "buttonText", "buttonUrl"],
});

export const emailTemplateRegistry: Record<EmailTemplateName, TemplateDefinition> = {
  "otp-verification": {
    key: "otp-verification.html",
    subject: "{{otp}} is your {{brandName}} verification code",
    text: "Hi {{userName}},\n\nYour verification code is {{otp}}. It expires in {{expiryTime}}.\n\nNever share this code. If you did not request it, contact {{supportEmail}}.",
    required: ["userName", "otp", "expiryTime"],
  },
  "email-verification": standard("email-verification", "Verify your email address"),
  welcome: standard("welcome", "Welcome to {{brandName}}"),
  "password-reset": {
    key: "password-reset.html",
    subject: "Reset your {{brandName}} password",
    text: "Hi {{userName}},\n\nReset your password: {{resetLink}}\n\nThis link expires in {{expiryTime}}. If you did not request this, contact {{supportEmail}}.",
    required: ["userName", "resetLink", "expiryTime"],
  },
  "login-alert": standard("login-alert", "New login to your {{brandName}} account"),
  "security-alert": standard("security-alert", "Security alert for your {{brandName}} account"),
  "invite-user": standard("invite-user", "You have been invited to {{brandName}}"),
  "organization-invite": standard("organization-invite", "Join {{organizationName}} on {{brandName}}"),
  "magic-link-login": standard("magic-link-login", "Your secure {{brandName}} sign-in link"),
  "account-approved": standard("account-approved", "Your {{brandName}} account is approved"),
  "account-rejected": standard("account-rejected", "Update about your {{brandName}} account"),
  "subscription-activated": standard("subscription-activated", "Your subscription is active"),
  "subscription-expiring": standard("subscription-expiring", "Your subscription expires soon"),
  "subscription-expired": standard("subscription-expired", "Your subscription has expired"),
  invoice: {
    key: "invoice.html",
    subject: "Invoice {{invoiceNumber}} from {{brandName}}",
    text: "Invoice {{invoiceNumber}}\nAmount: {{amount}}\nDate: {{invoiceDate}}\n\nView invoice: {{buttonUrl}}",
    required: ["userName", "invoiceNumber", "amount", "invoiceDate", "buttonUrl", "lineItemsHtml"],
    rawVariables: ["lineItemsHtml"],
  },
  "payment-successful": standard("payment-successful", "Payment successful — {{amount}}"),
  "payment-failed": standard("payment-failed", "Your payment could not be completed"),
  "refund-initiated": standard("refund-initiated", "Your refund has been initiated"),
  "refund-completed": standard("refund-completed", "Your refund is complete"),
  notification: standard("notification", "{{heading}}"),
  "contact-auto-reply": standard("contact-auto-reply", "We received your message"),
  "support-ticket-created": standard("support-ticket-created", "Support ticket {{ticketNumber}} created"),
  "support-ticket-closed": standard("support-ticket-closed", "Support ticket {{ticketNumber}} closed"),
  announcement: standard("announcement", "{{heading}}"),
  "order-confirmation": {
    key: "order-confirmation.html",
    subject: "Order confirmed #{{orderNumber}}",
    text: "Hi {{userName}},\n\nOrder #{{orderNumber}} is confirmed.\nOutlet: {{outletName}}\nTotal: {{total}}\nPayment: {{paymentMethod}}\n\nTrack it: {{buttonUrl}}",
    required: ["userName", "orderNumber", "outletName", "orderType", "paymentMethod", "subtotal", "discount", "total", "buttonUrl", "itemRowsHtml"],
    rawVariables: ["itemRowsHtml", "deliveryFeeRowHtml", "discountRowHtml"],
  },
  "wallet-topup": {
    key: "wallet-topup.html",
    subject: "Wallet topped up — {{amount}} added",
    text: "Hi {{userName}},\n\nAmount added: {{amount}}\nNew balance: {{newBalance}}\nTransaction: {{paymentId}}",
    required: ["userName", "amount", "newBalance", "paymentId"],
  },
};

export function getTemplateDefinition(name: EmailTemplateName) {
  return emailTemplateRegistry[name];
}

export function assertRequiredVariables(name: EmailTemplateName, data: TemplateVariables) {
  const missing = getTemplateDefinition(name).required.filter(
    (key) => data[key] === undefined || data[key] === null
  );
  if (missing.length) throw new Error(`Missing required variables for ${name}: ${missing.join(", ")}`);
}
