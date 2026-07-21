"use client";

import Image from "next/image";
import { ChevronLeft, Heart, Leaf, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AboutPage() {
  const router = useRouter();
  return <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
    <header className="flex items-center gap-3"><button onClick={() => router.back()} aria-label="Go back"><ChevronLeft className="w-5 h-5" /></button><div><p className="text-[10px] uppercase font-bold text-brand-gray-400">Profile</p><h1 className="font-heading text-xl font-bold">About PNUT MONSTER</h1></div></header>
    <section className="bg-white border border-brand-gray-200 rounded-3xl p-6 text-center"><Image src="/logo.webp" alt="PNUT MONSTER" width={110} height={110} className="mx-auto object-contain" /><h2 className="font-heading text-2xl font-bold mt-3">Healthy never tasted this fun!</h2><p className="text-sm leading-6 text-brand-gray-500 mt-3">PNUT MONSTER makes wholesome food exciting—fresh ingredients, bold flavours, and rewarding choices for everyday life.</p></section>
    <section className="grid grid-cols-3 gap-3">{[[Leaf, "Fresh", "Thoughtful ingredients"], [Heart, "Made with care", "Food you can feel good about"], [Sparkles, "Fun", "Healthy without the boring"]].map(([Icon, title, text]) => { const I = Icon as typeof Leaf; return <div key={String(title)} className="bg-white border rounded-2xl p-3 text-center"><I className="w-6 h-6 mx-auto text-green-500" /><h3 className="text-xs font-bold mt-2">{String(title)}</h3><p className="text-[10px] text-brand-gray-400 mt-1">{String(text)}</p></div>; })}</section>
    <section className="bg-white border rounded-2xl p-5"><div className="flex gap-3"><ShieldCheck className="w-6 h-6 text-brand-yellow-dark shrink-0" /><div><h2 className="font-bold">Your trust matters</h2><p className="text-sm text-brand-gray-500 mt-1 leading-6">We use your account and order information only to provide and improve the PNUT MONSTER experience. Payment credentials are handled by secure payment providers and are not stored in the app.</p></div></div></section>
    <section className="bg-white border rounded-2xl divide-y"><InfoRow label="Website" value="pnut.monster" href="https://pnut.monster" /><InfoRow label="Support" value="support@pnut.monster" href="mailto:support@pnut.monster" /><InfoRow label="App version" value="1.0.0" /></section>
    <p className="text-center text-xs text-brand-gray-400">© {new Date().getFullYear()} PNUT MONSTER. All rights reserved.</p>
  </div>;
}

function InfoRow({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = <div className="p-4 flex justify-between gap-4"><span className="text-sm font-semibold">{label}</span><span className="text-sm text-brand-gray-500 flex items-center gap-1">{label === "Support" && <Mail className="w-3.5 h-3.5" />}{value}</span></div>;
  return href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{content}</a> : content;
}
