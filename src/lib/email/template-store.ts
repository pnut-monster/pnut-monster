import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { emailConfig } from "./config";
import type { EmailTemplateName } from "./registry";
import { getTemplateDefinition } from "./registry";

type CacheEntry = { body: string; etag?: string; loadedAt: number; expiresAt: number };
const cache = new Map<string, CacheEntry>();

const s3 = new S3Client({ region: emailConfig.aws.templateRegion });

function objectKey(name: EmailTemplateName) {
  const filename = getTemplateDefinition(name).key;
  return emailConfig.aws.templatePrefix ? `${emailConfig.aws.templatePrefix}/${filename}` : filename;
}

function enforceCacheLimit() {
  while (cache.size > emailConfig.cache.maxEntries) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].loadedAt - b[1].loadedAt)[0];
    if (!oldest) return;
    cache.delete(oldest[0]);
  }
}

export async function getEmailTemplate(name: EmailTemplateName): Promise<string> {
  const key = objectKey(name);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.body;

  if (!emailConfig.aws.templateBucket) {
    throw new Error("AWS_EMAIL_TEMPLATE_BUCKET is not configured");
  }

  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: emailConfig.aws.templateBucket, Key: key })
    );
    const body = await result.Body?.transformToString("utf-8");
    if (!body) throw new Error(`S3 email template is empty: ${key}`);

    cache.set(key, {
      body,
      etag: result.ETag,
      loadedAt: Date.now(),
      expiresAt: Date.now() + emailConfig.cache.ttlMs,
    });
    enforceCacheLimit();
    return body;
  } catch (error) {
    if (cached && emailConfig.cache.allowStaleOnError) {
      console.warn(`[Email] Using stale cached template after S3 failure: ${key}`);
      return cached.body;
    }
    throw error;
  }
}

export function invalidateEmailTemplateCache(name?: EmailTemplateName) {
  if (!name) {
    const removed = cache.size;
    cache.clear();
    return removed;
  }
  return cache.delete(objectKey(name)) ? 1 : 0;
}

export function getEmailTemplateCacheStats() {
  return {
    entries: cache.size,
    templates: [...cache.entries()].map(([key, value]) => ({
      key,
      etag: value.etag,
      loadedAt: new Date(value.loadedAt).toISOString(),
      expiresAt: new Date(value.expiresAt).toISOString(),
    })),
  };
}

