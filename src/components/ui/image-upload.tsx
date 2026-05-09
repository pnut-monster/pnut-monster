"use client";

import { useState, useRef } from "react";
import { Upload, X, Link2, Loader2, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { getImageUrl } from "@/lib/utils/image";
import toast from "react-hot-toast";

interface ImageUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: string; // S3 folder: "menu", "categories", "outlets", "avatars", "banners"
  className?: string;
  aspect?: "square" | "landscape" | "portrait";
  placeholder?: string;
  maxSizeMB?: number;
}

export function ImageUpload({
  value,
  onChange,
  folder,
  className,
  aspect = "square",
  placeholder = "Upload image",
  maxSizeMB = 5,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const aspectClass = {
    square: "aspect-square",
    landscape: "aspect-video",
    portrait: "aspect-[3/4]",
  }[aspect];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`Image must be less than ${maxSizeMB}MB`);
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      const data = await res.json();
      onChange(data.url);

      const sizeKB = Math.round(data.size / 1024);
      if (data.method === "s3") {
        toast.success(`Uploaded as optimized WebP (${sizeKB}KB)`);
      } else {
        toast.success(`Image processed (${sizeKB}KB) — configure S3 for production`);
      }
    } catch (err) {
      console.error("Upload error:", err);
      toast.error(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleUrlSubmit = () => {
    const url = urlInput.trim();
    if (!url) return;

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      toast.error("Please enter a valid URL starting with https://");
      return;
    }

    onChange(url);
    setUrlInput("");
    setShowUrlInput(false);
    toast.success("Image URL set!");
  };

  const handleRemove = async () => {
    // Try to delete from S3 if it's an S3 URL
    if (value && value.includes("pnut-monster-assets")) {
      try {
        const key = value.split(".amazonaws.com/")[1] || value.split(".com/").pop();
        if (key) {
          await fetch(`/api/upload?key=${encodeURIComponent(key)}`, { method: "DELETE" });
        }
      } catch {
        // Ignore delete errors — still clear the value
      }
    }
    onChange(null);
  };

  const displayUrl = getImageUrl(value);

  return (
    <div className={cn("relative", className)}>
      {/* Image display / upload area */}
      {displayUrl ? (
        <div className={cn("relative rounded-xl overflow-hidden bg-brand-gray-100 border border-brand-gray-200", aspectClass)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt="Uploaded"
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 w-7 h-7 bg-brand-black/70 hover:bg-brand-black rounded-full flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      ) : (
        <div
          className={cn(
            "relative rounded-xl border-2 border-dashed border-brand-gray-300 bg-brand-gray-50 hover:border-brand-yellow hover:bg-brand-yellow/5 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2",
            aspectClass
          )}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <Loader2 className="w-8 h-8 text-brand-yellow animate-spin" />
              <span className="text-xs text-brand-gray-500">Converting to WebP...</span>
            </>
          ) : (
            <>
              <ImageIcon className="w-8 h-8 text-brand-gray-400" />
              <span className="text-xs font-semibold text-brand-gray-500">{placeholder}</span>
              <span className="text-[10px] text-brand-gray-400">Auto-optimized as WebP</span>
            </>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
      />

      {/* Action buttons */}
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-brand-gray-600 bg-white border border-brand-gray-200 rounded-lg hover:bg-brand-gray-50 transition-colors disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          {uploading ? "Processing..." : "Upload File"}
        </button>
        <button
          type="button"
          onClick={() => setShowUrlInput(!showUrlInput)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-brand-gray-600 bg-white border border-brand-gray-200 rounded-lg hover:bg-brand-gray-50 transition-colors"
        >
          <Link2 className="w-3.5 h-3.5" />
          Paste URL
        </button>
      </div>

      {/* URL input */}
      {showUrlInput && (
        <div className="flex gap-2 mt-2">
          <input
            type="url"
            placeholder="https://cdn.example.com/image.jpg"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleUrlSubmit())}
            className="flex-1 px-3 py-2 text-xs border border-brand-gray-200 rounded-lg outline-none focus:border-brand-yellow"
          />
          <button
            type="button"
            onClick={handleUrlSubmit}
            className="px-3 py-2 text-xs font-semibold bg-brand-yellow text-brand-black rounded-lg hover:bg-brand-yellow-dark transition-colors"
          >
            Set
          </button>
        </div>
      )}
    </div>
  );
}
