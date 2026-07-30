/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Camera, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import toast from "react-hot-toast";

type ScanResult = {
  success: boolean;
  order_id?: string;
  commission_earned?: number;
  error?: string;
};

export default function RepScanPage() {
  const [scanning, setScanning] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const scannerRef = useRef<unknown>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scanHandledRef = useRef(false);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  async function startScanner() {
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      setScanning(true);

      scanHandledRef.current = false;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 200, height: 200 } },
        (decodedText) => {
          if (scanHandledRef.current) return;
          scanHandledRef.current = true;
          stopScanner();
          confirmDelivery(decodedText.trim());
        },
        () => {}
      );
    } catch {
      toast.error("Camera access denied or unavailable");
      setScanning(false);
    }
  }

  function stopScanner() {
    const scanner = scannerRef.current as { stop?: () => Promise<void>; clear?: () => void } | null;
    if (scanner) {
      scanner.stop?.().then(() => scanner.clear?.()).catch(() => {});
      scannerRef.current = null;
    }
    setScanning(false);
  }

  async function confirmDelivery(orderId: string) {
    setProcessing(true);
    setResult(null);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("confirm_batch_delivery", {
      p_order_id: orderId,
    });

    if (error) {
      setResult({ success: false, error: error.message });
      toast.error(error.message);
    } else {
      const res = data as { success: boolean; order_id: string; commission_earned: number };
      setResult({ success: true, order_id: res.order_id, commission_earned: res.commission_earned });
      toast.success("Delivery confirmed!");
    }

    setProcessing(false);
  }

  async function handleManualSubmit() {
    const input = manualInput.trim();
    if (!input) { toast.error("Enter an order ID"); return; }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(input)) { toast.error("Invalid order ID format"); return; }
    await confirmDelivery(input);
    setManualInput("");
  }

  function reset() {
    setResult(null);
    setManualInput("");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-gray-900">Scan & Deliver</h1>

      {/* Result display */}
      {result && (
        <div className={`rounded-2xl p-6 text-center ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          {result.success ? (
            <>
              <CheckCircle2 size={48} className="mx-auto text-green-500 mb-3" />
              <p className="text-lg font-bold text-green-800">Delivered!</p>
              {result.commission_earned !== undefined && result.commission_earned > 0 && (
                <p className="text-sm text-green-600 mt-1">+₹{result.commission_earned} earned</p>
              )}
            </>
          ) : (
            <>
              <XCircle size={48} className="mx-auto text-red-500 mb-3" />
              <p className="text-lg font-bold text-red-800">Failed</p>
              <p className="text-sm text-red-600 mt-1">{result.error}</p>
            </>
          )}
          <button onClick={reset} className="mt-4 flex items-center gap-1 mx-auto text-sm text-gray-600 hover:text-gray-800">
            <RotateCcw size={14} /> Scan next
          </button>
        </div>
      )}

      {/* Scanner section */}
      {!result && (
        <>
          {scanning ? (
            <div className="space-y-3">
              <div ref={containerRef} className="relative rounded-2xl overflow-hidden bg-black aspect-square max-w-sm mx-auto">
                <div id="qr-reader" className="w-full h-full" />
              </div>
              <Button variant="outline" onClick={stopScanner} className="w-full">Stop Camera</Button>
            </div>
          ) : (
            <button onClick={startScanner}
              className="w-full py-8 rounded-2xl border-2 border-dashed border-gray-300 hover:border-brand-green flex flex-col items-center gap-2 text-gray-500 hover:text-brand-green transition-colors">
              <Camera size={32} />
              <span className="text-sm font-medium">Tap to Scan QR Code</span>
            </button>
          )}

          {/* Manual input */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase">Manual Entry</p>
            <p className="text-xs text-gray-400">Enter the order ID from the parcel label</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleManualSubmit()}
                placeholder="Order ID"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green"
              />
              <Button onClick={handleManualSubmit} disabled={processing} size="sm">
                {processing ? "..." : "Confirm"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
