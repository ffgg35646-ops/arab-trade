"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const columns = [
  {
    title: "المنصة",
    links: [
      ["الرئيسية", "/"],
      ["الأسواق", "/markets"],
      ["عن المنصة", "/about"],
      ["فريق العمل", "/team"],
    ],
  },
  {
    title: "الدعم",
    links: [
      ["الأسئلة الشائعة", "/faq"],
      ["تواصل معنا", "/contact"],
    ],
  },
  {
    title: "قانوني",
    links: [
      ["التراخيص والأمان", "/licenses"],
      ["الشروط والأحكام", "/terms"],
      ["سياسة الخصوصية", "/privacy"],
    ],
  },
];

export default function Footer() {
  const pathname = usePathname();
  if (pathname !== "/") return null;

  return (
    <footer className="border-t border-sky-400/15 bg-[#050a13]">
      <div className="mx-auto max-w-7xl px-2 py-5 sm:px-4 sm:py-12 lg:px-8">
        <div className="grid grid-cols-2 gap-x-2 gap-y-4 sm:gap-9 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:gap-8">
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="inline-flex rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-sky-400">
              <Image
                src="/logo.svg"
                alt="EQUITI للتداول"
                width={155}
                height={42}
                className="h-auto w-[110px] sm:w-[155px]"
              />
            </Link>
            <p className="mt-2 max-w-md text-xs leading-5 sm:mt-4 sm:text-sm sm:leading-7 text-slate-300">
              منصة عربية حديثة لمتابعة الأسواق وتجربة التداول والاستثمار
              ضمن واجهة واضحة وسريعة ومصممة للمستخدم العصري.
            </p>
            <div className="mt-3 flex items-center gap-2 sm:mt-5">
              {[
                ["f", "/contact"],
                ["telegram", "/contact"],
                ["𝕏", "/contact"],
              ].map(([icon, href], index) => (
                <Link
                  key={index}
                  href={href}
                  aria-label={icon === "telegram" ? "Telegram - اتصل بنا" : icon === "f" ? "Facebook - اتصل بنا" : "X - اتصل بنا"}
                  className="flex h-7 w-7 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-slate-600/70 bg-slate-900/80 text-slate-200 transition hover:border-sky-400/70 hover:bg-sky-400/10 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  {icon === "telegram" ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor">
                      <path d="M11.944 0C5.347 0 0 5.347 0 11.944s5.347 11.944 11.944 11.944 11.944-5.347 11.944-11.944S18.541 0 11.944 0zm5.866 8.177-1.966 9.267c-.148.657-.537.817-1.087.508l-3.006-2.215-1.45 1.397c-.16.16-.294.294-.603.294l.214-3.06 5.568-5.03c.242-.214-.053-.334-.375-.12l-6.88 4.332-2.966-.925c-.644-.2-.657-.644.134-.952l11.588-4.466c.537-.2 1.006.12.83.97z" />
                    </svg>
                  ) : (
                    <span className="text-sm font-bold">{icon}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="mb-2 text-xs sm:mb-4 sm:text-sm font-extrabold text-white">
                <span className="inline-block border-b-2 border-sky-400/70 pb-1 sm:pb-2">{column.title}</span>
              </h3>
              <div className="flex flex-col gap-1 sm:gap-2.5">
                {column.links.map(([label, href]) => {
                  const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
                  return (
                    <Link
                      key={label}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      style={active ? {
                        backgroundColor: "rgba(0, 111, 107, 0.35)",
                        color: "#ffffff",
                        borderColor: "rgba(0, 175, 170, 0.55)",
                      } : undefined}
                      className="group flex min-h-[26px] items-center justify-between gap-1 rounded-md sm:min-h-11 sm:gap-3 sm:rounded-xl border border-white/10 bg-[#050a13] px-1.5 py-1 text-[11px] font-semibold sm:px-3.5 sm:py-2.5 sm:text-sm text-white shadow-sm shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-[#00afaa]/60 hover:bg-[#006f6b]/25 hover:text-white hover:shadow-lg hover:shadow-sky-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00afaa]"
                    >
                      <span>{label}</span>
                      <span aria-hidden="true" className="text-[#81d8d0] transition group-hover:-translate-x-0.5 group-hover:text-white">←</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-slate-700/70 pt-3 sm:mt-10 sm:pt-5">
          <div className="flex flex-col gap-2 text-[11px] leading-5 sm:gap-3 sm:text-xs sm:leading-6 text-slate-300 sm:flex-row sm:items-start sm:justify-between">
            <span className="font-medium text-slate-200">© 2026 EQUITI للتداول. جميع الحقوق محفوظة.</span>
            <span className="max-w-3xl text-slate-300">
              التداول والاستثمار في الأصول المالية ينطويان على مخاطر،
              ويجب دراسة طبيعة الأسواق والمخاطر المرتبطة بها قبل اتخاذ
              أي قرار مالي.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
