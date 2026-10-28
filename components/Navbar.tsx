"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const links = [
  { href: "/", label: "الرئيسية" },
  { href: "/markets", label: "الأسواق" },
  { href: "/trading/spot", label: "التداول" },
  { href: "/about", label: "عن الموقع" },
  { href: "/contact", label: "تواصل معنا" },
  { href: "/licenses", label: "التراخيص والأمان" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header dir="rtl" className="sticky top-0 z-50 border-b border-white/10 bg-[#050a13]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between gap-3 px-3 sm:h-20 sm:px-5">
        <Link href="/" className="shrink-0" onClick={() => setOpen(false)}>
          <img src="/logo.svg" alt="EQUITI للتداول" className="h-9 w-auto sm:h-11" />
        </Link>
        <nav className="hidden items-center gap-2 lg:flex" aria-label="التنقل الرئيسي">
          {links.map((link) => {
            const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href + "/"));
            return <Link key={link.href} href={link.href} className={`rounded-xl px-4 py-3 text-sm font-medium transition ${active ? "bg-blue-500/10 text-cyan-300" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>{link.label}</Link>;
          })}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/login" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-200 transition hover:bg-white/5">تسجيل الدخول</Link>
          <Link href="/register" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">إنشاء حساب</Link>
        </div>
        <button type="button" onClick={() => setOpen(v => !v)} className="shrink-0 rounded-xl border border-white/10 p-2 text-slate-200 lg:hidden" aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}>
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
      {open && <nav className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-white/10 bg-[#07101d] p-3 lg:hidden" aria-label="التنقل للأجهزة الصغيرة">
        {links.map((link) => {
          const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href + "/"));
          return <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={`block rounded-xl px-4 py-3 text-sm transition ${active ? "bg-blue-500/10 text-cyan-300" : "text-slate-300 hover:bg-white/5"}`}>{link.label}</Link>;
        })}
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
          <Link href="/login" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-3 py-3 text-center text-sm text-slate-200">تسجيل الدخول</Link>
          <Link href="/register" onClick={() => setOpen(false)} className="rounded-xl bg-blue-600 px-3 py-3 text-center text-sm font-semibold text-white">إنشاء حساب</Link>
        </div>
      </nav>}
    </header>
  );
}
