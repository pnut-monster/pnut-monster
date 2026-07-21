import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.AWS_S3_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || "";

/**
 * Upload a processed buffer directly to S3
 */
export async function uploadToS3(
  key: string,
  body: Uint8Array,
  contentType: string
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  // Keep stored URLs stable while the bucket remains private. The same-origin
  // image route signs the S3 request server-side and never exposes credentials.
  return `/api/images/${key}`;
}

export async function getPrivateImageUrl(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: 60,
  });
}

/**
 * Delete an object from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

/**
 * Check if S3 is configured
 */
export function isS3Configured(): boolean {
  return Boolean(process.env.AWS_S3_BUCKET);
}
