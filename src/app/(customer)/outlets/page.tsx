"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Clock, Search, Navigation } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { useCartStore } from "@/lib/stores/cart-store";
import { calculateDistance, formatDistance } from "@/lib/utils/helpers";
import type { Outlet } from "@/lib/supabase/types";

type OutletSummary = Pick<
  Outlet,
  | "id"
  | "name"
  | "slug"
  | "address"
  | "city"
  | "state"
  | "pincode"
  | "latitude"
  | "longitude"
  | "phone"
  | "image_url"
  | "is_active"
  | "is_manually_closed"
  | "manual_close_reason"
  | "opens_at"
  | "closes_at"
  | "created_at"
  | "updated_at"
>;

interface OutletWithDistance extends OutletSummary {
  distance: number | null;
}

let cachedOutlets: OutletSummary[] | null = null;

export default function OutletsPage() {
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState(false);
  const router = useRouter();
  const { setOutlet } = useOutletStore();
  const { setOutlet: setCartOutlet } = useCartStore();

  useEffect(() => {
    let cancelled = false;

    async function fetchOutlets() {
      if (cachedOutlets) {
        setOutlets(cachedOutlets);
        setLoading(false);
      }

      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("outlets")
          .select(
            "id, name, slug, address, city, state, pincode, latitude, longitude, phone, image_url, is_active, is_manually_closed, manual_close_reason, opens_at, closes_at, created_at, updated_at"
          )
          .eq("is_active", true)
          .order("name");

        if (cancelled) return;

        const nextOutlets = (data as OutletSummary[] | null) ?? [];
        cachedOutlets = nextOutlets;
        setOutlets(nextOutlets);
      } catch (err) {
        console.error("Failed to fetch outlets:", err);
        if (!cancelled && !cachedOutlets) setOutlets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchOutlets();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Request location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          setLocationError(true);
        }
      );
    }
  }, []);

  const outletsWithDistance = useMemo(() => {
    const withDistance = outlets.map((outlet) => ({
        ...outlet,
        distance: userLocation
          ? calculateDistance(
              userLocation.lat,
              userLocation.lng,
              outlet.latitude,
              outlet.longitude
            )
          : null,
      }));

    if (userLocation) {
      withDistance.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
    }

    return withDistance;
  }, [outlets, userLocation]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return outletsWithDistance;
    return outletsWithDistance.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.address.toLowerCase().includes(q)
    );
  }, [outletsWithDistance, search]);

  const handleSelect = (outlet: OutletWithDistance) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { distance, ...outletData } = outlet;
    setOutlet(outletData);
    setCartOutlet(outletData.id);
    router.push("/menu");
  };

  const isOpen = (outlet: Outlet) => {
    return outlet.is_active && !outlet.is_manually_closed;
  };

  return (
    <div className="min-h-screen bg-[#FAFBFC]">
      <div className="sticky top-0 z-10 bg-white px-4 pb-3 pt-4 shadow-sm">
        <h1 className="mb-3 font-[family-name:var(--font-heading)] text-xl font-bold text-brand-black">
          Select Outlet
        </h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-gray-400" />
          <input
            type="text"
            placeholder="Search outlets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-brand-gray-200 bg-brand-gray-50 py-2.5 pl-10 pr-4 text-sm focus:border-brand-yellow focus:outline-none focus:ring-2 focus:ring-brand-yellow/20"
          />
        </div>
        {locationError && (
          <p className="mt-2 flex items-center gap-1 text-xs text-brand-gray-500">
            <Navigation className="h-3 w-3" />
            Enable location for distance sorting
          </p>
        )}
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <MapPin className="mx-auto mb-3 h-12 w-12 text-brand-gray-300" />
            <p className="font-[family-name:var(--font-heading)] text-lg text-brand-gray-500">
              No outlets found
            </p>
            <p className="text-sm text-brand-gray-400">Try a different search</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((outlet) => {
              const open = isOpen(outlet);
              return (
                <button
                  key={outlet.id}
                  onClick={() => handleSelect(outlet)}
                  disabled={!open}
                  className={`w-full rounded-2xl bg-white p-4 text-left shadow-sm transition-all active:scale-[0.98] ${
                    open ? "hover:shadow-md" : "opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-[family-name:var(--font-heading)] text-base font-bold text-brand-black">
                        {outlet.name}
                      </h3>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-brand-gray-500">
                        <MapPin className="h-3 w-3" />
                        {outlet.address}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            open
                              ? "bg-brand-green/10 text-brand-green"
                              : "bg-brand-red/10 text-brand-red"
                          }`}
                        >
                          <Clock className="h-3 w-3" />
                          {open ? "Open Now" : "Closed"}
                        </span>
                        {!open && outlet.manual_close_reason && (
                          <span className="text-xs text-brand-gray-400">
                            {outlet.manual_close_reason}
                          </span>
                        )}
                      </div>
                    </div>
                    {outlet.distance !== null && (
                      <span className="ml-3 whitespace-nowrap rounded-full bg-brand-yellow/10 px-2.5 py-1 text-xs font-bold text-brand-yellow-dark">
                        {formatDistance(outlet.distance)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
