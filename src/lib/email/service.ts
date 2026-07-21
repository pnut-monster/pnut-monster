import { emailConfig } from "./config";
import { deliverEmail, type EmailDeliveryResult } from "./client";
import {
  assertRequiredVariables,
  getTemplateDefinition,
  type EmailTemplateName,
} from "./registry";
import { renderTemplate, type TemplateVariables } from "./renderer";
import { getEmailTemplate } from "./template-store";

export type SendTemplateEmailOptions = {
  template: EmailTemplateName;
  to: string | string[];
  data: TemplateVariables;
  replyTo?: string;
  tags?: Record<string, string>;
};

function sharedVariables(): TemplateVariables {
  return {
    ...emailConfig.brand,
    currentYear: new Date().getUTCFullYear(),
  };
}
export async function renderEmail(
  template: EmailTemplateName,
  data: TemplateVariables
) {
  const definition = getTemplateDefinition(template);
  const variables = { ...sharedVariables(), ...data };
  assertRequiredVariables(template, variables);
  const source = await getEmailTemplate(template);
  const allowRawVariables = new Set(definition.rawVariables || []);

  return {
    subject: renderTemplate(definition.subject, variables),
    html: renderTemplate(source, variables, { allowRawVariables }),
    text: renderTemplate(definition.text, variables),
  };
}

export async function sendTemplateEmail({
  template,
  to,
  data,
  replyTo,
  tags,
}: SendTemplateEmailOptions): Promise<EmailDeliveryResult> {
  const rendered = await renderEmail(template, data);
  return deliverEmail({
    to,
    ...rendered,
    replyTo,
    tags: { template, ...tags },
  });
}
