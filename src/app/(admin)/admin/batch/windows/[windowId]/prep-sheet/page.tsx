"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Button, Spinner } from "@/components/ui";

type AggItem = { name: string; quantity: number; category: string; unit: string; instruction?: string };
type PrepSheetData = {
  title: string;
  outlet: string;
  window_time: string;
  date: string;
  total_orders: number;
  total_items: number;
  categories: Record<string, AggItem[]>;
};

export default function PrepSheetPrintPage() {
  const params = useParams();
  const windowId = params.windowId as string;
  const [data, setData] = useState<PrepSheetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/batch/${windowId}/prep-sheet`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to load prep sheet");
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

  const categoryNames = Object.keys(data.categories);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Print button - hidden in print */}
      <div className="print:hidden mb-4 flex justify-end">
        <Button onClick={() => window.print()} className="gap-2">
          <Printer size={16} /> Print
        </Button>
      </div>

      {/* Print-optimized content */}
      <div className="bg-white border border-gray-200 rounded-xl p-8 print:border-none print:rounded-none print:p-4">
        {/* Header */}
        <div className="text-center border-b border-gray-300 pb-4 mb-6">
          <h1 className="text-xl font-bold uppercase tracking-wide">{data.title}</h1>
          <p className="text-sm text-gray-600 mt-1">{data.outlet}</p>
          <p className="text-sm text-gray-600">{data.date} &middot; {data.window_time}</p>
          <div className="flex justify-center gap-8 mt-3 text-sm font-medium">
            <span>Total Orders: <strong>{data.total_orders}</strong></span>
            <span>Total Items: <strong>{data.total_items}</strong></span>
          </div>
        </div>

        {/* Categories */}
        {categoryNames.map(cat => (
          <div key={cat} className="mb-6">
            <h2 className="text-sm font-bold uppercase text-gray-500 tracking-wider mb-2 border-b border-gray-200 pb-1">
              {cat}
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase">
                  <th className="py-1 pr-4">Item</th>
                  <th className="py-1 pr-4 text-right w-20">Qty</th>
                  <th className="py-1 w-16">Unit</th>
                  <th className="py-1">Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.categories[cat].map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium text-gray-900">{item.name}</td>
                    <td className="py-2 pr-4 text-right font-bold text-gray-900">{item.quantity}</td>
                    <td className="py-2 text-gray-500">{item.unit}</td>
                    <td className="py-2 text-xs text-gray-400">{item.instruction || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-300 text-center text-xs text-gray-400">
          Generated on-demand &middot; PNUT MONSTER
        </div>
      </div>
    </div>
  );
}
