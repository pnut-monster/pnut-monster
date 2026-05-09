"use client";

import { useState } from "react";

/**
 * Generate a 4-digit delivery code from an order number string.
 * Uses a simple hash reduced to 4 digits (0000-9999).
 */
export function generateDeliveryCode(orderNumber: string): string {
  let hash = 0;
  for (let i = 0; i < orderNumber.length; i++) {
    const char = orderNumber.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const code = Math.abs(hash) % 10000;
  return code.toString().padStart(4, "0");
}

/**
 * Generate an 8x8 grid pattern from the delivery code.
 * Each cell is true (filled) or false (empty) based on code-derived bits.
 */
function generatePattern(code: string): boolean[][] {
  // Seed from the 4-digit code
  let seed = parseInt(code, 10);
  const grid: boolean[][] = [];

  for (let row = 0; row < 8; row++) {
    const rowCells: boolean[] = [];
    for (let col = 0; col < 8; col++) {
      // Simple pseudo-random from seed
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      rowCells.push(seed % 3 !== 0); // ~66% filled
    }
    grid.push(rowCells);
  }

  // Mirror horizontally for a QR-like look
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      grid[row][7 - col] = grid[row][col];
    }
  }

  // Set corner markers (like real QR codes)
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      grid[r][c] = true;
      grid[r][6 + c] = true;
      grid[6 + r][c] = true;
    }
  }

  return grid;
}

// ─── Display Component ───────────────────────────────────────────────

interface DeliveryCodeProps {
  orderNumber: string;
  size?: "sm" | "md" | "lg";
}

export function DeliveryCode({ orderNumber, size = "md" }: DeliveryCodeProps) {
  const code = generateDeliveryCode(orderNumber);
  const pattern = generatePattern(code);

  const cellSize = size === "sm" ? "w-2 h-2" : size === "lg" ? "w-4 h-4" : "w-3 h-3";
  const codeTextSize =
    size === "sm" ? "text-2xl" : size === "lg" ? "text-5xl" : "text-4xl";

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Large code display */}
      <div className="text-center">
        <p className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wider mb-1">
          Delivery Code
        </p>
        <p
          className={`${codeTextSize} font-heading font-bold text-brand-black tracking-[0.3em]`}
        >
          {code}
        </p>
      </div>

      {/* Pseudo-QR pattern */}
      <div className="p-2 bg-white rounded-lg border border-brand-gray-200 inline-block">
        <div className="grid grid-cols-8 gap-px">
          {pattern.map((row, rIdx) =>
            row.map((filled, cIdx) => (
              <div
                key={`${rIdx}-${cIdx}`}
                className={`${cellSize} rounded-[1px] ${
                  filled ? "bg-brand-black" : "bg-white"
                }`}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Verifier Component ──────────────────────────────────────────────

interface DeliveryCodeVerifierProps {
  orderNumber: string;
  onVerified: () => void;
  onCancel?: () => void;
}

export function DeliveryCodeVerifier({
  orderNumber,
  onVerified,
  onCancel,
}: DeliveryCodeVerifierProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const expectedCode = generateDeliveryCode(orderNumber);

  function handleVerify() {
    if (input === expectedCode) {
      setError(false);
      onVerified();
    } else {
      setError(true);
    }
  }

  function handleInputChange(value: string) {
    // Only allow digits, max 4
    const cleaned = value.replace(/\D/g, "").slice(0, 4);
    setInput(cleaned);
    if (error) setError(false);
  }

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <p className="text-sm font-semibold text-brand-gray-700">
        Enter the customer&apos;s 4-digit delivery code
      </p>

      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={input}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder="0000"
        className={`w-40 text-center text-3xl font-heading font-bold tracking-[0.4em] py-3 px-4 border-2 rounded-xl outline-none transition-colors ${
          error
            ? "border-brand-red bg-red-50 text-brand-red"
            : "border-brand-gray-300 focus:border-brand-green bg-white text-brand-black"
        }`}
      />

      {error && (
        <p className="text-sm text-brand-red font-medium">
          Code does not match. Please try again.
        </p>
      )}

      <div className="flex items-center gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border border-brand-gray-300 text-brand-gray-700 font-semibold text-sm hover:bg-brand-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleVerify}
          disabled={input.length < 4}
          className="px-5 py-2.5 rounded-xl bg-brand-green text-white font-semibold text-sm hover:bg-brand-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Verify Code
        </button>
      </div>

      {/* Scan QR placeholder */}
      <button
        type="button"
        className="mt-1 text-sm text-brand-green font-medium hover:underline"
        onClick={() => {
          // Placeholder — in production would open camera/scanner
          alert(`QR would decode to: ${expectedCode}`);
        }}
      >
        Or scan QR code
      </button>
    </div>
  );
}
