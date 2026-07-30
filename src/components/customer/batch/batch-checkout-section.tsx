// @ts-nocheck — batch tables not yet in generated types; remove after running migrations + type gen
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Clock, MapPin, Zap } from "lucide-react";

type Block = { id: string; name: string; display_order: number };
type SubLocation = { id: string; block_id: string; name: string; display_order: number };

type BatchContext = {
  windowId: string;
  reservationId: string;
  expiresAt: string;
  deliveryFee: number;
  blockId: string;
  subLocationId: string | null;
  subLocationText: string;
};

type Props = {
  outletId: string;
  onBatchContextChange: (ctx: BatchContext | null) => void;
};

export function BatchCheckoutSection({ outletId, onBatchContextChange }: Props) {
  const supabase = createClient();
  const [hasActiveWindow, setHasActiveWindow] = useState(false);
  const [windowId, setWindowId] = useState<string | null>(null);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [subLocations, setSubLocations] = useState<SubLocation[]>([]);
  const [selectedBlock, setSelectedBlock] = useState("");
  const [selectedSubLocation, setSelectedSubLocation] = useState("");
  const [subLocationText, setSubLocationText] = useState("");
  const [reserving, setReserving] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);

  // Check for active batch window for this outlet
  useEffect(() => {
    async function check() {
      const { data } = await supabase
        .from("batch_windows")
        .select("id, hub_id, delivery_fee")
        .eq("outlet_id", outletId)
        .eq("status", "open")
        .limit(1)
        .single();

      if (data) {
        setHasActiveWindow(true);
        setWindowId(data.id);
        setDeliveryFee(data.delivery_fee);

        // Load blocks for this hub
        const { data: blockData } = await supabase
          .from("delivery_blocks")
          .select("id, name, display_order")
          .eq("hub_id", data.hub_id)
          .eq("is_active", true)
          .order("display_order");

        if (blockData) setBlocks(blockData as Block[]);

        // Load all sub-locations for these blocks
        if (blockData && blockData.length > 0) {
          const blockIds = blockData.map(b => b.id);
          const { data: subData } = await supabase
            .from("delivery_sub_locations")
            .select("id, block_id, name, display_order")
            .in("block_id", blockIds)
            .eq("is_active", true)
            .order("display_order");
          if (subData) setSubLocations(subData as SubLocation[]);
        }
      }
    }
    if (outletId) check();
  }, [outletId, supabase]);

  // Timer countdown
  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        setExpired(true);
        setReservationId(null);
        onBatchContextChange(null);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onBatchContextChange]);

  // Reserve slot when user opts into batch
  const reserveSlot = useCallback(async () => {
    if (!windowId) return;
    setReserving(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc("reserve_batch_slot", {
      p_window_id: windowId,
    });

    if (rpcError) {
      setError(rpcError.message);
      setReserving(false);
      return;
    }

    const result = data as { reservation_id: string; expires_at: string };
    setReservationId(result.reservation_id);
    setExpiresAt(result.expires_at);
    setExpired(false);
    setReserving(false);
  }, [windowId, supabase]);

  // Release slot on unmount
  useEffect(() => {
    return () => {
      if (reservationId) {
        supabase.rpc("release_batch_slot", { p_reservation_id: reservationId });
      }
    };
  }, [reservationId, supabase]);

  // Update parent context whenever selection changes
  useEffect(() => {
    if (reservationId && selectedBlock && !expired) {
      onBatchContextChange({
        windowId: windowId!,
        reservationId,
        expiresAt: expiresAt!,
        deliveryFee,
        blockId: selectedBlock,
        subLocationId: selectedSubLocation || null,
        subLocationText,
      });
    } else {
      onBatchContextChange(null);
    }
  }, [reservationId, selectedBlock, selectedSubLocation, subLocationText, expired, windowId, expiresAt, deliveryFee, onBatchContextChange]);

  if (!hasActiveWindow) return null;

  const filteredSubs = subLocations.filter(s => s.block_id === selectedBlock);

  return (
    <div className="rounded-2xl border-2 border-brand-green/30 bg-brand-green/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-brand-green" />
          <span className="font-bold text-sm text-brand-green-dark">Batch Delivery Available!</span>
        </div>
        {deliveryFee === 0 ? (
          <span className="text-xs font-bold text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full">FREE delivery</span>
        ) : (
          <span className="text-xs font-medium text-gray-600">Delivery: ₹{deliveryFee}</span>
        )}
      </div>

      {!reservationId && !expired && (
        <div>
          <p className="text-xs text-gray-600 mb-2">
            Order in the current batch window for {deliveryFee === 0 ? "free" : `₹${deliveryFee}`} delivery to your campus block.
          </p>
          <button
            onClick={reserveSlot}
            disabled={reserving}
            className="w-full py-2 rounded-xl bg-brand-green text-white text-sm font-bold hover:bg-brand-green-dark transition-colors disabled:opacity-50"
          >
            {reserving ? "Reserving slot..." : "Reserve Batch Slot"}
          </button>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      )}

      {expired && (
        <div className="text-center py-2">
          <p className="text-sm text-red-600 font-medium">Slot expired! Your reservation timed out.</p>
          <button onClick={reserveSlot} disabled={reserving}
            className="mt-2 text-xs text-brand-green underline font-medium">
            Try again
          </button>
        </div>
      )}

      {reservationId && !expired && (
        <>
          {/* Timer */}
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-gray-200">
            <Clock size={16} className={timeLeft <= 30 ? "text-red-500" : "text-brand-green"} />
            <span className={`text-sm font-bold tabular-nums ${timeLeft <= 30 ? "text-red-500" : "text-gray-700"}`}>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
            </span>
            <span className="text-xs text-gray-500">to complete checkout</span>
          </div>

          {/* Block selection */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              <MapPin size={12} className="inline mr-1" />
              Delivery Block <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedBlock}
              onChange={e => { setSelectedBlock(e.target.value); setSelectedSubLocation(""); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green"
            >
              <option value="">Select your block...</option>
              {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* Sub-location */}
          {selectedBlock && filteredSubs.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Sub-location (optional)
              </label>
              <select
                value={selectedSubLocation}
                onChange={e => setSelectedSubLocation(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green"
              >
                <option value="">Select...</option>
                {filteredSubs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* Free-text sub-location if no options configured */}
          {selectedBlock && filteredSubs.length === 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Floor / Room (optional)
              </label>
              <input
                type="text"
                value={subLocationText}
                onChange={e => setSubLocationText(e.target.value)}
                placeholder="e.g. Floor 2, Room 205"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
