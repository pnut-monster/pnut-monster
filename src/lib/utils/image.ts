/**
 * Image URL resolver
 *
 * In production: images served via S3 + CloudFront CDN
 * In development: falls back to direct URL or placeholder
 *
 * Usage:
 *   getImageUrl("menu/og-sprout-bowl.jpg")  → https://cdn.pnutmonster.com/menu/og-sprout-bowl.jpg
 *   getImageUrl(null)                       → null (use placeholder)
 */

const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL;

export function getImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;

  // Already a full URL (S3, CDN, or external)
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  // Prefix with CDN URL if configured
  if (CDN_URL) {
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return `${CDN_URL}/${cleanPath}`;
  }

  // Fallback: return as-is (local public folder or relative path)
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Image categories for S3 folder structure:
 *
 * menu/           → Menu item images
 * categories/     → Category images
 * outlets/        → Outlet photos
 * avatars/        → User profile pictures
 * banners/        → Promotional banners
 * campaigns/      → Campaign images
 * brand/          → Logo, icons, brand assets
 */
export const IMAGE_PATHS = {
  menu: "menu",
  categories: "categories",
  outlets: "outlets",
  avatars: "avatars",
  banners: "banners",
  campaigns: "campaigns",
  brand: "brand",
} as const;
