import { SESClient, SendEmailCommand, type MessageTag } from "@aws-sdk/client-ses";
import { emailConfig } from "./config";

const ses = new SESClient({ region: emailConfig.aws.region });

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: Record<string, string>;
}

export type EmailDeliveryResult = {
  success: true;
  messageId: string;
};

function validateAddress(address: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || /[\r\n]/.test(address)) {
    throw new Error("Invalid email address");
  }
  return address;
}

function messageTags(tags?: Record<string, string>): MessageTag[] | undefined {
  if (!tags) return undefined;
  return Object.entries(tags).slice(0, 50).map(([Name, Value]) => ({
    Name: Name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256),
    Value: String(Value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256),
  }));
}

export async function deliverEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  tags,
}: SendEmailOptions): Promise<EmailDeliveryResult> {
  if (!isSESConfigured()) throw new Error("AWS SES sender configuration is incomplete");

  const recipients = (Array.isArray(to) ? to : [to]).map(validateAddress);
  if (recipients.length === 0 || recipients.length > 50) {
    throw new Error("Email must have between 1 and 50 recipients");
  }

  const result = await ses.send(
    new SendEmailCommand({
      Source: `${emailConfig.sender.name.replace(/[\r\n<>]/g, "")} <${validateAddress(emailConfig.sender.email)}>`,
      Destination: { ToAddresses: recipients },
      ReplyToAddresses: replyTo || emailConfig.sender.replyTo
        ? [validateAddress(replyTo || emailConfig.sender.replyTo)]
        : undefined,
      ConfigurationSetName: emailConfig.sender.configurationSet || undefined,
      Tags: messageTags(tags),
      Message: {
        Subject: { Data: subject.replace(/[\r\n]+/g, " ").slice(0, 998), Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: { Data: text, Charset: "UTF-8" },
        },
      },
    })
  );

  if (!result.MessageId) throw new Error("AWS SES did not return a message ID");
  return { success: true, messageId: result.MessageId };
}

/** Compatibility wrapper for legacy raw-email callers. Prefer sendTemplateEmail. */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  try {
    await deliverEmail(options);
    return true;
  } catch (error) {
    console.error("[Email] Delivery failed", error);
    return false;
  }
}

export function isSESConfigured(): boolean {
  return Boolean(emailConfig.sender.email && emailConfig.aws.region);
}
