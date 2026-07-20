"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { MenuItem } from "@/lib/supabase/types";
import { formatCurrency, cn } from "@/lib/utils/helpers";
import { getImageUrl } from "@/lib/utils/image";
import {
  Search,
  ChevronLeft,
  X,
  Leaf,
  Star,
  Sparkles,
  Clock,
  TrendingUp,
} from "lucide-react";

const POPULAR_SEARCHES = [
  "Sprouts",
  "Smoothie",
  "Bowl",
  "Protein",
  "Salad",
  "Juice",
  "Peanut",
  "Healthy",
];

const RECENT_SEARCHES_KEY = "pnut-recent-searches";
const MAX_RECENT = 6;

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  try {
    const recent = getRecentSearches().filter(
      (s) => s.toLowerCase() !== query.toLowerCase()
    );
    recent.unshift(query);
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT))
    );
  } catch {
    // ignore localStorage errors
  }
}

function clearRecentSearches() {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // ignore
  }
}

function escapeIlikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export default function SearchPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchSeqRef = useRef(0);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getRecentSearches());

  // Auto-focus the input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      searchSeqRef.current += 1;
      return;
    }

    const searchSeq = searchSeqRef.current + 1;
    searchSeqRef.current = searchSeq;
    const timer = setTimeout(async () => {
      setLoading(true);
      let items: MenuItem[] = [];
      try {
        const supabase = createClient();

        const { data } = await supabase
          .from("menu_items")
          .select("*")
          .eq("is_active", true)
          .or(
            `name.ilike.%${escapeIlikePattern(trimmed)}%,description.ilike.%${escapeIlikePattern(trimmed)}%`
          )
          .order("is_bestseller", { ascending: false })
          .limit(20);

        items = (data ?? []) as MenuItem[];
      } catch (err) {
        console.error("Failed to search:", err);
      }

      if (searchSeqRef.current !== searchSeq) return;
      setResults(items);
      setHasSearched(true);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectItem = useCallback(
    (item: MenuItem) => {
      if (query.trim()) {
        saveRecentSearch(query.trim());
      }
      router.push(`/menu/${item.slug}`);
    },
    [query, router]
  );

  const handleChipSearch = useCallback((term: string) => {
    setQuery(term);
    saveRecentSearch(term);
    setRecentSearches(getRecentSearches());
  }, []);

  const handleClearRecent = useCallback(() => {
    clearRecentSearches();
    setRecentSearches([]);
  }, []);

  const handleClearQuery = useCallback(() => {
    searchSeqRef.current += 1;
    setQuery("");
    setResults([]);
    setHasSearched(false);
    inputRef.current?.focus();
  }, []);

  const showSuggestions = !hasSearched && query.trim().length < 2;

  return (
    <div className="min-h-screen bg-[#FFF8E7]">
      {/* Search Header */}
      <div className="sticky top-0 z-20 bg-[#FFF8E7]/95 backdrop-blur-sm border-b border-[#F5B731]/20 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5 text-[#1A1A1A]" />
          </button>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1A1A1A]/30" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                const nextQuery = e.target.value;
                setQuery(nextQuery);
                if (nextQuery.trim().length < 2) {
                  searchSeqRef.current += 1;
                  setResults([]);
                  setHasSearched(false);
                  setLoading(false);
                }
              }}
              placeholder="Search sprouts, drinks, bowls..."
              className="w-full pl-10 pr-10 py-2.5 bg-white rounded-xl border-2 border-[#1A1A1A]/10 focus:border-[#F5B731] outline-none font-[family-name:var(--font-body)] text-[#1A1A1A] text-sm placeholder:text-[#1A1A1A]/30 transition-colors"
            />
            {query && (
              <button
                onClick={handleClearQuery}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#1A1A1A]/10 flex items-center justify-center"
              >
                <X className="w-3 h-3 text-[#1A1A1A]/50" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Suggestions (shown when not actively searching) */}
      {showSuggestions && (
        <div className="px-4 pt-5">
          {/* Recent Searches */}
          {recentSearches.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#1A1A1A]/40" />
                  <h3 className="font-[family-name:var(--font-heading)] text-[#1A1A1A] font-semibold text-sm">
                    Recent Searches
                  </h3>
                </div>
                <button
                  onClick={handleClearRecent}
                  className="font-[family-name:var(--font-body)] text-[#F5B731] text-xs font-semibold"
                >
                  Clear All
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    onClick={() => handleChipSearch(term)}
                    className="px-3 py-1.5 bg-white border border-[#1A1A1A]/10 rounded-full font-[family-name:var(--font-body)] text-[#1A1A1A] text-xs font-medium"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Popular Searches */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-[#F5B731]" />
              <h3 className="font-[family-name:var(--font-heading)] text-[#1A1A1A] font-semibold text-sm">
                Popular Searches
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {POPULAR_SEARCHES.map((term) => (
                <button
                  key={term}
                  onClick={() => handleChipSearch(term)}
                  className="px-3 py-1.5 bg-[#F5B731]/10 border border-[#F5B731]/30 rounded-full font-[family-name:var(--font-body)] text-[#1A1A1A] text-xs font-semibold"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center pt-16">
          <div className="w-8 h-8 border-3 border-[#F5B731] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Results */}
      {!loading && hasSearched && (
        <div className="px-4 pt-4 pb-8">
          {results.length > 0 ? (
            <>
              <p className="font-[family-name:var(--font-body)] text-[#1A1A1A]/50 text-xs mb-3">
                {results.length} result{results.length !== 1 ? "s" : ""} found
              </p>
              <div className="space-y-3">
                {results.map((item) => (
                  <SearchResultCard
                    key={item.id}
                    item={item}
                    onClick={() => handleSelectItem(item)}
                  />
                ))}
              </div>
            </>
          ) : (
            /* Empty State */
            <div className="flex flex-col items-center justify-center pt-16 px-6">
              <div className="w-20 h-20 rounded-full bg-[#1A1A1A]/5 flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-[#1A1A1A]/20" />
              </div>
              <p className="font-[family-name:var(--font-heading)] text-[#1A1A1A] font-semibold text-base text-center">
                No items found
              </p>
              <p className="font-[family-name:var(--font-body)] text-[#1A1A1A]/50 text-sm text-center mt-1">
                Try searching with different keywords
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchResultCard({
  item,
  onClick,
}: {
  item: MenuItem;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm text-left"
    >
      {/* Image */}
      <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-[#FFF8E7] flex-shrink-0">
        {item.image_url ? (
          <Image
            src={getImageUrl(item.image_url) ?? ""}
            alt={item.name}
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Leaf className="w-6 h-6 text-[#4CAF50]/40" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {/* Veg indicator */}
          <div
            className={cn(
              "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
              item.is_veg ? "border-[#4CAF50]" : "border-red-500"
            )}
          >
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                item.is_veg ? "bg-[#4CAF50]" : "bg-red-500"
              )}
            />
          </div>
          <h4 className="font-[family-name:var(--font-heading)] text-[#1A1A1A] font-semibold text-sm truncate">
            {item.name}
          </h4>
          {item.is_bestseller && (
            <Star
              className="w-3 h-3 text-[#F5B731] flex-shrink-0"
              fill="currentColor"
            />
          )}
          {item.is_new && (
            <Sparkles className="w-3 h-3 text-[#4CAF50] flex-shrink-0" />
          )}
        </div>
        {item.description && (
          <p className="font-[family-name:var(--font-body)] text-[#1A1A1A]/50 text-xs mt-0.5 line-clamp-1">
            {item.description}
          </p>
        )}
        <p className="font-[family-name:var(--font-heading)] text-[#1A1A1A] font-bold text-sm mt-1">
          {formatCurrency(item.base_price)}
        </p>
      </div>
    </button>
  );
}
