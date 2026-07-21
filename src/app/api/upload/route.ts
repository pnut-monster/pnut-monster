import { NextRequest, NextResponse } from "next/server";
import { uploadToS3, deleteFromS3, isS3Configured } from "@/lib/s3/client";
import { createClient } from "@/lib/supabase/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const ALLOWED_UPLOAD_ROLES = new Set(["admin", "super_admin"]);
const ALLOWED_FOLDERS = new Set([
  "menu", "categories", "outlets", "avatars", "banners", "campaigns", "brand",
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function isDevelopmentOrigin(origin: URL): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  const host = origin.hostname;
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" ||
    host.startsWith("10.") || host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    (origin.protocol === "http:" && ["3000", "3001"].includes(origin.port) && isIpv4);
}

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  if (parsedOrigin.origin !== request.nextUrl.origin && parsedOrigin.origin !== configuredOrigin && !isDevelopmentOrigin(parsedOrigin)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  return null;
}

async function requireUploadAccess(folder?: string) {
  const supabase = await createClient(folder === "avatars" ? "sb-customer-auth-token" : "sb-admin-auth-token");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), userId: null };
  if (folder === "avatars") return { error: null, userId: user.id };

  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const profile = data as { role: string } | null;
  if (!profile || !ALLOWED_UPLOAD_ROLES.has(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), userId: null };
  }
  return { error: null, userId: user.id };
}

function isAllowedFolder(folder: string) {
  return ALLOWED_FOLDERS.has(folder);
}

function isSafeGeneratedKey(key: string) {
  return /^[a-z-]+\/[0-9a-f-]+\.(?:webp|png|jpe?g|gif|avif)$/.test(key) && isAllowedFolder(key.split("/")[0]);
}

type DetectedImage = { contentType: string; extension: string };

function detectImage(bytes: Uint8Array): DetectedImage | null {
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    return { contentType: "image/webp", extension: "webp" };
  }
  if (bytes.length >= 12 && ascii(4, 4) === "ftyp" && ["avif", "avis"].includes(ascii(8, 4))) {
    return { contentType: "image/avif", extension: "avif" };
  }
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    return { contentType: "image/png", extension: "png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(0, 6))) {
    return { contentType: "image/gif", extension: "gif" };
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = String(formData.get("folder") || "");
    if (!isAllowedFolder(folder)) return NextResponse.json({ error: "Invalid upload folder" }, { status: 400 });

    const access = await requireUploadAccess(folder);
    if (access.error) return access.error;
    const rateLimit = await consumeRateLimit("upload", access.userId!, 30, 60);
    if (!rateLimit.allowed) return NextResponse.json(
      { error: "Too many upload requests" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retry_after) } }
    );
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Image must be between 1 byte and 10MB" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detectImage(bytes);
    if (!detected) return NextResponse.json({ error: "Unsupported or invalid image format" }, { status: 400 });

    const key = `${folder}/${crypto.randomUUID()}.${detected.extension}`;
    if (isS3Configured()) {
      const url = await uploadToS3(key, bytes, detected.contentType);
      return NextResponse.json({ url, key, size: bytes.length, method: "s3" });
    }
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json({ error: "Image storage is not configured" }, { status: 503 });
    }

    const dataUrl = `data:${detected.contentType};base64,${Buffer.from(bytes).toString("base64")}`;
    return NextResponse.json({ url: dataUrl, key, size: bytes.length, method: "local" });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const access = await requireUploadAccess();
    if (access.error) return access.error;
    const rateLimit = await consumeRateLimit("upload", access.userId!, 30, 60);
    if (!rateLimit.allowed) return NextResponse.json(
      { error: "Too many upload requests" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retry_after) } }
    );

    const key = request.nextUrl.searchParams.get("key");
    if (!key || !isSafeGeneratedKey(key)) {
      return NextResponse.json({ error: "Invalid key parameter" }, { status: 400 });
    }
    if (isS3Configured()) await deleteFromS3(key);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }
}
