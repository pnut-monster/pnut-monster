"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, LifeBuoy, Loader2, Mail, MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Ticket = Database["public"]["Tables"]["support_tickets"]["Row"];
type Category = Ticket["category"];
const FAQ = [
  ["Where can I track my order?", "Open Orders from the bottom navigation and select your order to see its current preparation status."],
  ["How do refunds work?", "Approved refunds are returned to the original payment source or wallet. Bank processing can take 5–7 business days."],
  ["How do I use wallet or loyalty points?", "Available wallet balance and eligible loyalty points can be selected during checkout."],
  ["Can I change an order after placing it?", "Preparation may begin immediately. Create a support ticket with the order number and we will help if a change is still possible."],
];

export default function SupportPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [category, setCategory] = useState<Category>("order");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
    setTickets((data ?? []) as Ticket[]);
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (subject.trim().length < 3 || message.trim().length < 10) { toast.error("Please provide more detail"); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase.from("support_tickets").insert({ user_id: user.id, category, subject: subject.trim(), message: message.trim(), status: "open" } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Support ticket created"); setSubject(""); setMessage(""); setShowForm(false); await load();
  };

  return <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
    <header className="flex items-center gap-3"><button onClick={() => router.back()} aria-label="Go back"><ChevronLeft className="w-5 h-5" /></button><div><p className="text-[10px] uppercase font-bold text-brand-gray-400">Profile</p><h1 className="font-heading text-xl font-bold">Help & Support</h1></div></header>
    <div className="rounded-2xl bg-brand-yellow/15 p-5 text-center"><LifeBuoy className="w-9 h-9 mx-auto text-brand-yellow-dark" /><h2 className="font-bold mt-2">How can we help?</h2><p className="text-sm text-brand-gray-500 mt-1">Browse common questions or send our team a ticket.</p><button onClick={() => setShowForm(v => !v)} className="mt-4 bg-brand-yellow rounded-xl px-4 py-2.5 text-sm font-bold inline-flex gap-2"><MessageSquarePlus className="w-4 h-4" /> Create Ticket</button></div>

    {showForm && <form onSubmit={submit} className="bg-white border border-brand-gray-200 rounded-2xl p-4 space-y-3">
      <h2 className="font-bold">New support ticket</h2>
      <label className="block text-xs font-semibold text-brand-gray-500">Category<select value={category} onChange={e => setCategory(e.target.value as Category)} className="mt-1 w-full border rounded-xl px-3 py-2.5 text-sm bg-white"><option value="order">Order</option><option value="payment">Payment</option><option value="wallet">Wallet</option><option value="account">Account</option><option value="feedback">Feedback</option><option value="other">Other</option></select></label>
      <label className="block text-xs font-semibold text-brand-gray-500">Subject<input maxLength={120} value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 w-full border rounded-xl px-3 py-2.5 text-sm" required /></label>
      <label className="block text-xs font-semibold text-brand-gray-500">How can we help?<textarea rows={5} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} className="mt-1 w-full border rounded-xl px-3 py-2.5 text-sm resize-none" required /></label>
      <button disabled={saving} className="w-full bg-brand-yellow py-3 rounded-xl font-bold flex justify-center">{saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit Ticket"}</button>
    </form>}

    <section><h2 className="font-bold mb-3">Frequently asked questions</h2><div className="bg-white border rounded-2xl divide-y overflow-hidden">{FAQ.map(([q, a], index) => <button key={q} onClick={() => setOpenFaq(openFaq === index ? null : index)} className="w-full p-4 text-left"><span className="flex justify-between gap-3 text-sm font-semibold">{q}<ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openFaq === index ? "rotate-180" : ""}`} /></span>{openFaq === index && <p className="text-sm text-brand-gray-500 mt-2 font-normal">{a}</p>}</button>)}</div></section>

    {tickets.length > 0 && <section><h2 className="font-bold mb-3">Your tickets</h2><div className="space-y-3">{tickets.map(ticket => <article key={ticket.id} className="bg-white border rounded-2xl p-4"><div className="flex justify-between"><span className="text-xs font-bold text-brand-gray-400">{ticket.ticket_number}</span><span className="text-[10px] uppercase font-bold bg-brand-gray-100 rounded-full px-2 py-1">{ticket.status.replace("_", " ")}</span></div><h3 className="font-bold text-sm mt-2">{ticket.subject}</h3><p className="text-sm text-brand-gray-500 mt-1">{ticket.message}</p>{ticket.admin_response && <div className="mt-3 rounded-xl bg-green-50 p-3"><p className="text-xs font-bold text-green-700">Support response</p><p className="text-sm mt-1">{ticket.admin_response}</p></div>}<p className="text-xs text-brand-gray-400 mt-3">{new Date(ticket.created_at).toLocaleString("en-IN")}</p></article>)}</div></section>}

    <a href="mailto:support@pnut.monster" className="flex items-center justify-center gap-2 text-sm font-semibold text-brand-yellow-dark"><Mail className="w-4 h-4" /> support@pnut.monster</a>
  </div>;
}
