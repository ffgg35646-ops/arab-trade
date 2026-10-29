"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const internalColumns = [
  {
    title: "حسابك",
    links: [
      ["الرئيسية", "/dashboard"],
      ["الأسواق", "/dashboard/markets"],
      ["الباقات", "/dashboard/packages"],
      ["سجل التداول", "/dashboard/trades"],
    ],
  },
  {
    title: "الدعم",
    links: [
      ["مركز الدعم", "/dashboard/support"],
      ["الإشعارات", "/dashboard/notifications"],
    ],
  },
  {
    title: "الحساب والأمان",
    links: [
      ["التراخيص والأمان", "/dashboard/licenses"],
      ["بيانات الحساب", "/dashboard/account"],
    ],
  },
];

const columns = [
  {
    title: "المنصة",
    links: [
      ["الرئيسية", "/"],
      ["الأسواق", "/markets"],
      ["التداول", "/protrade"],
      ["عن المنصة", "/about"],
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

export default function Footer({ showOnInternal = false }: { showOnInternal?: boolean }) {
  const pathname = usePathname();
  const visibleColumns = showOnInternal ? internalColumns : columns;
  const homeHref = showOnInternal ? "/dashboard" : "/";
  if (!showOnInternal && (pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/protrade" || pathname.startsWith("/protrade/") || pathname === "/margin" || pathname.startsWith("/margin/") || pathname === "/futures" || pathname.startsWith("/futures/"))) return null;

  return (
    <footer className="border-t border-sky-400/15 bg-[#050a13]">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid gap-9 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:gap-8">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href={homeHref} className="inline-flex rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-sky-400">
              <Image
                src="/logo.svg"
                alt="EQUITI للتداول"
                width={155}
                height={42}
                className="h-auto w-[155px]"
              />
            </Link>
            <p className="mt-4 max-w-md text-sm leading-7 text-slate-300">
              منصة عربية حديثة لمتابعة الأسواق وتجربة التداول والاستثمار
              ضمن واجهة واضحة وسريعة ومصممة للمستخدم العصري.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {[
                ["f", "#"],
                ["✈", "#"],
                ["𝕏", "#"],
              ].map(([icon, href], index) => (
                <a
                  key={index}
                  href={href}
                  aria-label="Social link"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-600/70 bg-slate-900/80 text-slate-200 transition hover:border-sky-400/70 hover:bg-sky-400/10 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  <span className="text-sm font-bold">{icon}</span>
                </a>
              ))}
            </div>
          </div>
          {visibleColumns.map((column) => (
            <div key={column.title}>
              <h3 className="mb-4 text-sm font-extrabold text-white">
                <span className="inline-block border-b-2 border-sky-400/70 pb-2">{column.title}</span>
              </h3>
              <div className="flex flex-col gap-2.5">
                {column.links.map(([label, href]) => (
                  <Link
                    key={label}
                    href={href}
                    className="group flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-900/65 px-3.5 py-2.5 text-sm font-semibold text-slate-100 shadow-sm shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-sky-400/60 hover:bg-sky-400/10 hover:text-white hover:shadow-lg hover:shadow-sky-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    <span>{label}</span>
                    <span aria-hidden="true" className="text-sky-300/70 transition group-hover:-translate-x-0.5 group-hover:text-sky-200">←</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-10 border-t border-slate-700/70 pt-5">
          <div className="flex flex-col gap-3 text-xs leading-6 text-slate-300 sm:flex-row sm:items-start sm:justify-between">
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
