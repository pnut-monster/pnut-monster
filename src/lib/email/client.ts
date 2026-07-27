import { AwsClient } from "aws4fetch";
import { emailConfig } from "./config";

function getSESClient() {
  return new AwsClient({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    region: emailConfig.aws.region,
    service: "ses",
  });
}

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

function buildSESParams(options: SendEmailOptions): URLSearchParams {
  const { to, subject, html, text, replyTo, tags } = options;
  const recipients = (Array.isArray(to) ? to : [to]).map(validateAddress);
  if (recipients.length === 0 || recipients.length > 50) {
    throw new Error("Email must have between 1 and 50 recipients");
  }

  const params = new URLSearchParams();
  params.set("Action", "SendEmail");
  params.set("Source", `${emailConfig.sender.name.replace(/[\r\n<>]/g, "")} <${validateAddress(emailConfig.sender.email)}>`);

  recipients.forEach((addr, i) => {
    params.set(`Destination.ToAddresses.member.${i + 1}`, addr);
  });

  const replyAddr = replyTo || emailConfig.sender.replyTo;
  if (replyAddr) {
    params.set("ReplyToAddresses.member.1", validateAddress(replyAddr));
  }

  if (emailConfig.sender.configurationSet) {
    params.set("ConfigurationSetName", emailConfig.sender.configurationSet);
  }

  params.set("Message.Subject.Data", subject.replace(/[\r\n]+/g, " ").slice(0, 998));
  params.set("Message.Subject.Charset", "UTF-8");
  params.set("Message.Body.Html.Data", html);
  params.set("Message.Body.Html.Charset", "UTF-8");
  params.set("Message.Body.Text.Data", text);
  params.set("Message.Body.Text.Charset", "UTF-8");

  if (tags) {
    Object.entries(tags).slice(0, 50).forEach(([key, value], i) => {
      const name = key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256);
      const val = String(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256);
      params.set(`Tags.member.${i + 1}.Name`, name);
      params.set(`Tags.member.${i + 1}.Value`, val);
    });
  }

  return params;
}

export async function deliverEmail(options: SendEmailOptions): Promise<EmailDeliveryResult> {
  if (!isSESConfigured()) throw new Error("AWS SES sender configuration is incomplete");

  const client = getSESClient();
  const region = emailConfig.aws.region;
  const url = `https://email.${region}.amazonaws.com/`;
  const body = buildSESParams(options).toString();

  const res = await client.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SES SendEmail failed (${res.status}): ${text}`);
  }

  const xml = await res.text();
  const match = xml.match(/<MessageId>([^<]+)<\/MessageId>/);
  if (!match) throw new Error("AWS SES did not return a message ID");
  return { success: true, messageId: match[1] };
}

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
