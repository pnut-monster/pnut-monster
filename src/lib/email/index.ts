export { deliverEmail, sendEmail, isSESConfigured } from "./client";
export type { SendEmailOptions, EmailDeliveryResult } from "./client";
export { sendTemplateEmail, renderEmail } from "./service";
export type { SendTemplateEmailOptions } from "./service";
export {
  EMAIL_TEMPLATE_NAMES,
  emailTemplateRegistry,
  getTemplateDefinition,
} from "./registry";
export type { EmailTemplateName } from "./registry";
export {
  invalidateEmailTemplateCache,
  getEmailTemplateCacheStats,
} from "./template-store";
export { emailConfig, isEmailInfrastructureConfigured } from "./config";
export { escapeHtml } from "./renderer";
export type { TemplateVariables } from "./renderer";
