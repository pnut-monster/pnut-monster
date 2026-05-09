import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { uploadToS3, deleteFromS3, isS3Configured } from "@/lib/s3/client";

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
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "misc";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Get size preset for this folder
    const preset = SIZE_PRESETS[folder] || DEFAULT_PRESET;

    // Process with sharp: resize + convert to WebP
    const processedBuffer = await sharp(inputBuffer)
      .resize(preset.width, preset.height, {
        fit: "inside",         // Maintain aspect ratio, fit within bounds
        withoutEnlargement: true, // Don't upscale small images
      })
      .webp({ quality: preset.quality })
      .toBuffer();

    // Generate unique filename
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
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
    const key = request.nextUrl.searchParams.get("key");
    if (!key) {
      return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
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
