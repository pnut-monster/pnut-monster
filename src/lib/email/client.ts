import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({
  region: process.env.AWS_SES_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || "noreply@pnutmonster.com";
const FROM_NAME = process.env.SES_FROM_NAME || "PNUT Monster";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<boolean> {
  if (!isSESConfigured()) {
    console.warn("[Email] SES not configured — skipping email to", to);
    return false;
  }

  try {
    await ses.send(
      new SendEmailCommand({
        Source: `${FROM_NAME} <${FROM_EMAIL}>`,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: html, Charset: "UTF-8" },
            ...(text ? { Text: { Data: text, Charset: "UTF-8" } } : {}),
          },
        },
      })
    );
    return true;
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    return false;
  }
}

export function isSESConfigured(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.SES_FROM_EMAIL
  );
}
