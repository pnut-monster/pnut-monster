import { NextRequest, NextResponse } from "next/server";
import { getPrivateImageUrl, isS3Configured } from "@/lib/s3/client";

const ALLOWED_FOLDERS = new Set([
  "menu", "categories", "outlets", "avatars", "banners", "campaigns", "brand",
]);

function isSafeImageKey(key: string) {
  return /^[a-z-]+\/[0-9a-f-]+\.(?:webp|png|jpe?g|gif|avif)$/.test(key) &&
    ALLOWED_FOLDERS.has(key.split("/")[0]);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ key: string[] }> }
) {
  const { key: parts } = await context.params;
  const key = parts.join("/");
  if (!isS3Configured() || !isSafeImageKey(key)) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  try {
    const signedUrl = await getPrivateImageUrl(key);
    const upstream = await fetch(signedUrl);
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Private image read failed:", error);
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
}
