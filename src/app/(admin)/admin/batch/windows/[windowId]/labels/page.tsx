"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
/* eslint-disable @next/next/no-img-element */

type LabelItem = { name: string; qty: number; customizations: unknown };
type Label = {
  sequence: number;
  order_id: string;
  customer_name: string;
  customer_phone: string;
  block_name: string;
  sub_location: string;
  items: LabelItem[];
  notes: string | null;
  qr_data: string;
};
type LabelsData = {
  outlet_name: string;
  window_date: string;
  label_format: string;
  total_labels: number;
  labels: Label[];
};

function QRCode({ data, size = 80 }: { data: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    async function generate() {
      try {
        const QR = await import("qrcode");
        const url = await QR.toDataURL(data, {
          width: size * 2,
          margin: 1,
          errorCorrectionLevel: "M",
        });
        setSrc(url);
      } catch {
        setSrc(null);
      }
    }
    generate();
  }, [data, size]);

  if (!src) {
    return (
      <div className="flex items-center justify-center bg-gray-100 border border-gray-200" style={{ width: size, height: size }}>
        <span className="text-[8px] text-gray-400">QR</span>
      </div>
    );
  }

  return <img src={src} alt="QR" width={size} height={size} className="border border-gray-200" />;
}

export default function LabelsPrintPage() {
  const params = useParams();
  const windowId = params.windowId as string;
  const [data, setData] = useState<LabelsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/batch/${windowId}/labels`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to load labels");
      } else {
        setData(await res.json());
      }
      setLoading(false);
    }
    load();
  }, [windowId]);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (error) return <div className="text-center py-20 text-red-500">{error}</div>;
  if (!data) return null;

  const isThermal = data.label_format === "thermal";

  return (
    <div className="max-w-4xl mx-auto">
      {/* Print button */}
      <div className="print:hidden mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Parcel Labels</h1>
          <p className="text-sm text-gray-500">{data.outlet_name} &middot; {data.window_date} &middot; {data.total_labels} labels</p>
        </div>
        <Button onClick={() => window.print()} className="gap-2">
          <Printer size={16} /> Print All
        </Button>
      </div>

      {/* Labels grid */}
      <div className={`${isThermal ? "space-y-2" : "grid grid-cols-2 gap-4 print:gap-0"}`}>
        {data.labels.map(label => (
          <div key={label.order_id}
            className={`bg-white border border-gray-300 p-4 print:border-gray-400 ${
              isThermal ? "max-w-sm" : ""
            } ${!isThermal ? "print:break-inside-avoid" : ""}`}
            style={isThermal ? { width: "80mm" } : undefined}>

            {/* Label header */}
            <div className="flex items-start justify-between gap-2 border-b border-dashed border-gray-300 pb-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black text-gray-900">#{label.sequence}</span>
                  <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">{label.block_name}</span>
                </div>
                <p className="text-sm font-semibold text-gray-800 mt-1 truncate">{label.customer_name}</p>
                <p className="text-xs text-gray-500">{label.customer_phone}</p>
              </div>
              <QRCode data={label.qr_data} size={isThermal ? 60 : 72} />
            </div>

            {/* Location */}
            <div className="mb-2">
              <p className="text-xs text-gray-500">
                <span className="font-medium">{label.block_name}</span>
                {label.sub_location !== "—" && <> &rarr; {label.sub_location}</>}
              </p>
            </div>

            {/* Items */}
            <div className="border-t border-gray-200 pt-2">
              <ul className="text-xs space-y-0.5">
                {label.items.map((item, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-gray-700">{item.name}</span>
                    <span className="font-bold text-gray-900">×{item.qty}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Notes */}
            {label.notes && (
              <div className="mt-2 pt-1 border-t border-dashed border-gray-200">
                <p className="text-xs text-gray-500 italic">Note: {label.notes}</p>
              </div>
            )}

            {/* Footer */}
            <div className="mt-2 pt-1 border-t border-gray-200 flex justify-between text-[9px] text-gray-400">
              <span>{data.outlet_name}</span>
              <span>{data.window_date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
