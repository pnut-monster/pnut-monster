import { AwsClient } from "aws4fetch";

function getS3Client() {
  return new AwsClient({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    region: process.env.AWS_S3_REGION || "ap-south-1",
    service: "s3",
  });
}

const BUCKET = () => process.env.AWS_S3_BUCKET || "";
const REGION = () => process.env.AWS_S3_REGION || "ap-south-1";

function s3Url(key: string) {
  return `https://${BUCKET()}.s3.${REGION()}.amazonaws.com/${key}`;
}

export async function uploadToS3(
  key: string,
  body: Uint8Array,
  contentType: string
): Promise<string> {
  const client = getS3Client();
  const res = await client.fetch(s3Url(key), {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: body as unknown as BodyInit,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`S3 PUT failed (${res.status}): ${text}`);
  }
  return `/api/images/${key}`;
}

export async function getPrivateImageUrl(key: string): Promise<string> {
  const client = getS3Client();
  const signed = await client.sign(s3Url(key), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}

export async function deleteFromS3(key: string): Promise<void> {
  const client = getS3Client();
  const res = await client.fetch(s3Url(key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`S3 DELETE failed (${res.status}): ${text}`);
  }
}

export function isS3Configured(): boolean {
  return Boolean(process.env.AWS_S3_BUCKET);
}
