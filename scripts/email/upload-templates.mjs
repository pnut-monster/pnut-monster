import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { loadLocalEnv } from "../aws/load-local-env.mjs";

await loadLocalEnv();

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const templateDir = resolve(root, "email-templates");
const bucket = process.env.AWS_EMAIL_TEMPLATE_BUCKET;
const prefix = (process.env.AWS_EMAIL_TEMPLATE_PREFIX || "email-templates").replace(/^\/+|\/+$/g, "");
const region = process.env.AWS_EMAIL_TEMPLATE_REGION || process.env.AWS_S3_REGION || "ap-south-1";

if (!bucket) throw new Error("AWS_EMAIL_TEMPLATE_BUCKET is required");
const manifest = JSON.parse(await readFile(resolve(templateDir, "manifest.json"), "utf8"));
const s3 = new S3Client({ region });

for (const [destination, source] of Object.entries(manifest)) {
  const body = await readFile(resolve(templateDir, source));
  const key = prefix ? `${prefix}/${destination}` : destination;
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: "text/html; charset=utf-8",
    CacheControl: "no-cache",
    ServerSideEncryption: "AES256",
    Metadata: { sha256: createHash("sha256").update(body).digest("hex") },
  }));
  process.stdout.write(`Uploaded s3://${bucket}/${key}\n`);
}
