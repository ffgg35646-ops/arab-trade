"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";
import { useState } from "react";
export default function Navbar() {

  const [open, setOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const pathname = usePathname();

  const isSpotActive = pathname === "/protrade";
  const isProActive = pathname === "/protrade/pro";

  return (
    <header
      dir="rtl"
      className="relative z-50 border-b border-white/10 bg-[#050a13]/95 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-20 max-w-[1500px] items-center justify-between px-5">

        {/* Logo */}
        <Link
          href="/"
          className="shrink-0 transition-opacity hover:opacity-80"
        >
          <img
            src="/logo.svg"
            alt="عرب تريد"
            className="h-11 w-auto"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-2 lg:flex">

          <Link
            href="/"
            className="rounded-xl px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            الرئيسية
          </Link>

          <Link
            href="/markets"
            className="rounded-xl px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            الأسواق
          </Link>

          {/* Trading Dropdown */}
          <div
            className="relative"
            onMouseEnter={() => setTradeOpen(true)}
            onMouseLeave={() => setTradeOpen(false)}
          >
            <button
              type="button"
              onClick={() => setTradeOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl bg-blue-500/10 px-5 py-3 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20 hover:text-cyan-300"
            >
              التداول
              <ChevronDown
                size={16}
                className={`transition-transform ${
                  tradeOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {tradeOpen && (
              <div className="absolute right-0 top-full w-64 pt-2">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#07101d] p-2 shadow-2xl shadow-black/40">

                  {/* أول عنصر */}
                  <Link
                    href="/protrade"
                    onClick={() => setTradeOpen(false)}
                    className={`group flex items-center justify-between rounded-xl px-4 py-4 transition ${
                      isSpotActive
                        ? "bg-blue-500/10"
                        : "hover:bg-blue-500/10"
                    }`}
                  >
                    <div>
                      <div
                        className={`text-sm font-semibold ${
                          isSpotActive ? "text-cyan-300" : "text-white"
                        }`}
                      >
                        التداول الفوري
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        Spot Trading
                      </div>
                    </div>

                    <span
                      className={`transition-transform group-hover:-translate-x-1 ${
                        isSpotActive ? "text-cyan-400" : "text-slate-500"
                      }`}
                    >
                      ←
                    </span>
                  </Link>

              <Link
                href="/protrade/pro"
                onClick={() => setTradeOpen(false)}
                className={`group flex items-center justify-between rounded-xl px-4 py-4 transition ${
                  isProActive
                    ? "bg-blue-500/10"
                    : "hover:bg-blue-500/10"
                }`}
              >
                <div>
                  <div
                    className={`text-sm font-semibold ${
                      isProActive ? "text-cyan-300" : "text-white"
                    }`}
                  >
                    التداول الاحترافي
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Professional Trading
                  </div>
                </div>

                <span
                  className={`transition-transform group-hover:-translate-x-1 ${
                    isProActive ? "text-cyan-400" : "text-slate-500"
                  }`}
                >
                  ←
                </span>
              </Link>

                  {/* العناصر القادمة */}
                  <Link
                    href="/margin"
                    onClick={() => setTradeOpen(false)}
                    className="group flex items-center justify-between rounded-xl bg-blue-500/10 px-4 py-4 transition hover:bg-blue-500/20"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">
                        التداول بالهامش
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        Margin Trading
                      </div>
                    </div>

                    <span className="text-cyan-400 transition-transform group-hover:-translate-x-1">
                      ←
                    </span>
                  </Link>



                  <Link
                    href="/futures"
                    onClick={() => setTradeOpen(false)}
                    className={`group flex items-center justify-between rounded-xl px-4 py-4 transition ${
                      pathname.startsWith("/futures")
                        ? "bg-blue-500/10 text-cyan-300"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        العقود الآجلة
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        Futures Trading
                      </div>
                    </div>

                    <span
                      className={`transition-transform group-hover:-translate-x-1 ${
                        pathname.startsWith("/futures")
                          ? "text-cyan-400"
                          : "text-slate-600"
                      }`}
                    >
                      ←
                    </span>
                  </Link>


                </div>
              </div>
            )}
          </div>

          <Link
            href="/about"
            className="rounded-xl px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            عن عرب تريد
          </Link>

          <Link
            href="/contact"
            className="rounded-xl px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            تواصل معنا
          </Link>

        </nav>

        {/* Auth */}
        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/login"
            className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-blue-400/30 hover:bg-white/5"
          >
            تسجيل الدخول
          </Link>

          <Link
            href="/register"
            className="rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400"
          >
            إنشاء حساب
          </Link>
        </div>

        {/* Mobile button */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-xl border border-white/10 p-3 text-slate-200 lg:hidden"
          aria-label="فتح القائمة"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>

      </div>

      {/* Mobile Navigation */}
      {open && (
        <div className="border-t border-white/10 bg-[#07101d] px-5 py-4 lg:hidden">

          <div className="flex flex-col gap-2">

            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-3 text-sm text-slate-300 hover:bg-white/5"
            >
              الرئيسية
            </Link>

            <Link
              href="/markets"
              onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-3 text-sm text-slate-300 hover:bg-white/5"
            >
              الأسواق
            </Link>

            <button
              type="button"
              onClick={() => setTradeOpen((v) => !v)}
              className="flex items-center justify-between rounded-xl bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-300"
            >
              <span>التداول</span>
              <ChevronDown
                size={16}
                className={`transition-transform ${
                  tradeOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {tradeOpen && (
              <div className="mr-3 flex flex-col gap-1 border-r border-blue-400/20 pr-3">

                <Link
                  href="/protrade"
                  onClick={() => setOpen(false)}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    isSpotActive
                      ? "bg-blue-500/10 text-cyan-300"
                      : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  التداول الفوري
                </Link>

                <Link
                  href="/protrade/pro"
                  onClick={() => setOpen(false)}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    isProActive
                      ? "bg-blue-500/10 text-cyan-300"
                      : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  التداول الاحترافي
                </Link>

                <Link
                  href="/margin"
                  onClick={() => {
                    setOpen(false)
                    setTradeOpen(false)
                  }}
                  className="rounded-xl bg-blue-500/10 px-4 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-blue-500/20"
                >
                  التداول بالهامش
                </Link>



                <Link
                  href="/futures"
                  onClick={() => setOpen(false)}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    pathname.startsWith("/futures")
                      ? "bg-blue-500/10 text-cyan-300"
                      : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  العقود الآجلة
                </Link>


              </div>
            )}

            <Link
              href="/about"
              onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-3 text-sm text-slate-300 hover:bg-white/5"
            >
              عن عرب تريد
            </Link>

            <Link
              href="/contact"
              onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-3 text-sm text-slate-300 hover:bg-white/5"
            >
              تواصل معنا
            </Link>

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-4">

              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-semibold text-slate-200"
              >
                تسجيل الدخول
              </Link>

              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="rounded-xl bg-blue-500 px-4 py-3 text-center text-sm font-bold text-white"
              >
                إنشاء حساب
              </Link>

            </div>

          </div>
        </div>
      )}
    </header>
  );
}