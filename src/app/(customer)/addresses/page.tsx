"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Home, Loader2, MapPin, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import type { Database } from "@/lib/supabase/types";

type Address = Database["public"]["Tables"]["customer_addresses"]["Row"];
type Form = Pick<Address, "label" | "recipient_name" | "phone" | "address_line_1" | "address_line_2" | "landmark" | "city" | "state" | "pincode" | "is_default">;
const EMPTY: Form = { label: "Home", recipient_name: "", phone: "", address_line_1: "", address_line_2: "", landmark: "", city: "", state: "", pincode: "", is_default: false };

export default function AddressesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("customer_addresses").select("*").order("is_default", { ascending: false }).order("created_at");
    if (error) toast.error("Could not load addresses");
    setAddresses((data ?? []) as Address[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const openNew = () => { setEditingId(null); setForm({ ...EMPTY, is_default: addresses.length === 0 }); setShowForm(true); };
  const openEdit = (address: Address) => {
    setEditingId(address.id);
    setForm({ label: address.label, recipient_name: address.recipient_name, phone: address.phone, address_line_1: address.address_line_1, address_line_2: address.address_line_2 ?? "", landmark: address.landmark ?? "", city: address.city, state: address.state, pincode: address.pincode, is_default: address.is_default });
    setShowForm(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(form.pincode)) { toast.error("Enter a valid 6-digit pincode"); return; }
    if (form.phone.replace(/\D/g, "").length < 10) { toast.error("Enter a valid phone number"); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const payload = { ...form, address_line_2: form.address_line_2 || null, landmark: form.landmark || null, user_id: user.id };
    const result = editingId
      ? await supabase.from("customer_addresses").update(payload as never).eq("id", editingId)
      : await supabase.from("customer_addresses").insert(payload as never);
    setSaving(false);
    if (result.error) { toast.error(result.error.message); return; }
    toast.success(editingId ? "Address updated" : "Address saved");
    setShowForm(false); await load();
  };

  const remove = async (address: Address) => {
    if (!confirm(`Delete your ${address.label} address?`)) return;
    const { error } = await supabase.from("customer_addresses").delete().eq("id", address.id);
    if (error) toast.error(error.message); else { toast.success("Address deleted"); await load(); }
  };

  const makeDefault = async (id: string) => {
    const { error } = await supabase.from("customer_addresses").update({ is_default: true } as never).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Default address updated"); await load(); }
  };

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Spinner size="lg" /></div>;

  return <div className="px-4 py-6 max-w-lg mx-auto space-y-5">
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3"><button onClick={() => router.back()} aria-label="Go back" className="p-1.5"><ChevronLeft className="w-5 h-5" /></button><div><p className="text-[10px] font-bold text-brand-gray-400 uppercase">Profile</p><h1 className="font-heading text-xl font-bold">My Addresses</h1></div></div>
      <button onClick={openNew} className="flex items-center gap-1.5 rounded-xl bg-brand-yellow px-3 py-2 text-sm font-bold"><Plus className="w-4 h-4" /> Add</button>
    </header>

    {addresses.length === 0 && !showForm && <div className="bg-white border border-brand-gray-200 rounded-2xl p-8 text-center"><MapPin className="w-10 h-10 text-brand-gray-300 mx-auto mb-3" /><h2 className="font-bold">No saved addresses</h2><p className="text-sm text-brand-gray-500 mt-1">Save an address for faster checkout.</p><button onClick={openNew} className="mt-5 bg-brand-yellow px-5 py-2.5 rounded-xl text-sm font-bold">Add Address</button></div>}

    {showForm && <form onSubmit={save} className="bg-white border border-brand-gray-200 rounded-2xl p-4 space-y-3">
      <div className="flex justify-between"><h2 className="font-bold">{editingId ? "Edit address" : "Add address"}</h2><button type="button" onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button></div>
      <div className="grid grid-cols-2 gap-3"><Input label="Label" value={form.label} onChange={v => setForm(p => ({ ...p, label: v }))} required /><Input label="Recipient name" value={form.recipient_name} onChange={v => setForm(p => ({ ...p, recipient_name: v }))} required /></div>
      <Input label="Phone" type="tel" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} required />
      <Input label="Address line 1" value={form.address_line_1} onChange={v => setForm(p => ({ ...p, address_line_1: v }))} required />
      <Input label="Address line 2 (optional)" value={form.address_line_2 ?? ""} onChange={v => setForm(p => ({ ...p, address_line_2: v }))} />
      <Input label="Landmark (optional)" value={form.landmark ?? ""} onChange={v => setForm(p => ({ ...p, landmark: v }))} />
      <div className="grid grid-cols-2 gap-3"><Input label="City" value={form.city} onChange={v => setForm(p => ({ ...p, city: v }))} required /><Input label="State" value={form.state} onChange={v => setForm(p => ({ ...p, state: v }))} required /></div>
      <Input label="Pincode" inputMode="numeric" maxLength={6} value={form.pincode} onChange={v => setForm(p => ({ ...p, pincode: v.replace(/\D/g, "") }))} required />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_default} onChange={e => setForm(p => ({ ...p, is_default: e.target.checked }))} /> Make this my default address</label>
      <button disabled={saving} className="w-full bg-brand-yellow rounded-xl py-3 font-bold flex justify-center">{saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Address"}</button>
    </form>}

    <div className="space-y-3">{addresses.map(address => <article key={address.id} className="bg-white border border-brand-gray-200 rounded-2xl p-4">
      <div className="flex items-start gap-3"><div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Home className="w-5 h-5 text-blue-500" /></div><div className="flex-1"><div className="flex gap-2 items-center"><h2 className="font-bold">{address.label}</h2>{address.is_default && <span className="text-[10px] font-bold bg-brand-yellow/20 px-2 py-0.5 rounded-full">DEFAULT</span>}</div><p className="text-sm font-semibold mt-1">{address.recipient_name} · {address.phone}</p><p className="text-sm text-brand-gray-500 mt-1">{[address.address_line_1, address.address_line_2, address.landmark, address.city, address.state, address.pincode].filter(Boolean).join(", ")}</p></div></div>
      <div className="flex gap-2 mt-4 pt-3 border-t border-brand-gray-100">{!address.is_default && <button onClick={() => makeDefault(address.id)} className="text-xs font-semibold flex gap-1 items-center"><Star className="w-3.5 h-3.5" /> Set default</button>}<div className="ml-auto flex gap-3"><button onClick={() => openEdit(address)} aria-label="Edit"><Pencil className="w-4 h-4" /></button><button onClick={() => remove(address)} aria-label="Delete"><Trash2 className="w-4 h-4 text-red-500" /></button></div></div>
    </article>)}</div>
  </div>;
}

function Input({ label, value, onChange, ...props }: { label: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <label className="block"><span className="block text-xs font-semibold text-brand-gray-500 mb-1">{label}</span><input {...props} value={value} onChange={e => onChange(e.target.value)} className="w-full border border-brand-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-yellow" /></label>;
}
