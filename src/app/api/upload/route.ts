import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { uploadToS3, deleteFromS3, isS3Configured } from "@/lib/s3/client";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_UPLOAD_ROLES = new Set(["admin", "super_admin"]);

// Max dimensions per folder — keeps images optimized per use case
const SIZE_PRESETS: Record<string, { width: number; height: number; quality: number }> = {
  menu:       { width: 800,  height: 800,  quality: 80 },
  categories: { width: 1200, height: 600,  quality: 80 },
  outlets:    { width: 1200, height: 800,  quality: 80 },
  avatars:    { width: 256,  height: 256,  quality: 75 },
  banners:    { width: 1600, height: 800,  quality: 80 },
  campaigns:  { width: 1200, height: 600,  quality: 80 },
  brand:      { width: 800,  height: 800,  quality: 85 },
};

const DEFAULT_PRESET = { width: 1200, height: 1200, quality: 80 };
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB raw input limit
const MAX_INPUT_PIXELS = 25_000_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
// NOTE: In-process only — does not share state across serverless instances.
// For multi-instance deployments, use platform-level rate limiting or an external store.
const uploadRateLimit = new Map<string, { count: number; resetAt: number }>();

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const requestOrigin = request.nextUrl.origin;
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  const allowedOrigins = new Set([requestOrigin]);
  if (configuredOrigin) allowedOrigins.add(configuredOrigin);

  if (!allowedOrigins.has(origin)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  return null;
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const current = uploadRateLimit.get(key);
  if (!current || current.resetAt <= now) {
    uploadRateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return NextResponse.json({ error: "Too many upload requests" }, { status: 429 });
  }

  current.count += 1;
  return null;
}

async function requireUploadAccess(folder?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), isAdmin: false };
  }

  // Any authenticated user can upload to avatars
  if (folder === "avatars") {
    return { error: null, userId: user.id, isAdmin: false };
  }

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const profile = data as { role: string } | null;

  if (!profile || !ALLOWED_UPLOAD_ROLES.has(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), isAdmin: false };
  }

  return { error: null, userId: user.id, isAdmin: true };
}

function isAllowedFolder(folder: string): folder is keyof typeof SIZE_PRESETS {
  return Object.prototype.hasOwnProperty.call(SIZE_PRESETS, folder);
}

function isSafeGeneratedKey(key: string): boolean {
  return /^[a-z-]+\/[0-9a-f-]+\.webp$/.test(key) && isAllowedFolder(key.split("/")[0]);
}

/**
 * POST /api/upload
 *
 * Accepts a multipart form upload, converts to optimized WebP,
 * and uploads to S3.
 *
 * FormData fields:
 *   file: File
 *   folder: string ("menu", "categories", "outlets", "avatars", "banners", etc.)
 *
 * Response: { url: string, key: string, size: number, method: "s3" | "local" }
 */
export async function POST(request: NextRequest) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "misc";

    const access = await requireUploadAccess(folder);
    if (access.error) return access.error;
    const rateLimitError = checkRateLimit(access.userId!);
    if (rateLimitError) return rateLimitError;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }

    if (!isAllowedFolder(folder)) {
      return NextResponse.json({ error: "Invalid upload folder" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    const image = sharp(inputBuffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
    });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "jpg", "png", "webp", "gif", "avif"].includes(metadata.format)) {
      return NextResponse.json({ error: "Unsupported image format" }, { status: 400 });
    }

    // Get size preset for this folder
    const preset = SIZE_PRESETS[folder] || DEFAULT_PRESET;

    // Process with sharp: resize + convert to WebP
    const processedBuffer = await image
      .resize(preset.width, preset.height, {
        fit: "inside",         // Maintain aspect ratio, fit within bounds
        withoutEnlargement: true, // Don't upscale small images
      })
      .webp({ quality: preset.quality })
      .toBuffer();

    // Generate unique filename
    const safeName = `${crypto.randomUUID()}.webp`;
    const key = `${folder}/${safeName}`;

    if (isS3Configured()) {
      const url = await uploadToS3(key, processedBuffer, "image/webp");
      return NextResponse.json({
        url,
        key,
        size: processedBuffer.length,
        method: "s3",
      });
    }

    // Fallback: S3 not configured — return as base64 data URL for local dev
    const base64 = processedBuffer.toString("base64");
    const dataUrl = `data:image/webp;base64,${base64}`;
    return NextResponse.json({
      url: dataUrl,
      key,
      size: processedBuffer.length,
      method: "local",
      message: "S3 not configured. Image processed but stored as data URL.",
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to process and upload image" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/upload?key=folder/filename.webp
 *
 * Deletes an image from S3.
 */
export async function DELETE(request: NextRequest) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    const access = await requireUploadAccess();
    if (access.error) return access.error;
    const rateLimitError = checkRateLimit(access.userId!);
    if (rateLimitError) return rateLimitError;

    const key = request.nextUrl.searchParams.get("key");
    if (!key) {
      return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
    }

    if (!isSafeGeneratedKey(key)) {
      return NextResponse.json({ error: "Invalid key parameter" }, { status: 400 });
    }

    if (isS3Configured()) {
      await deleteFromS3(key);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete image" },
      { status: 500 }
    );
  }
}
