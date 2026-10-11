"use client";

import Image from "next/image";
import Link from "next/link";

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
      ["الشروط والأحكام", "/terms"],
      ["سياسة الخصوصية", "/privacy"],
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#050a13]">
      <div className="mx-auto max-w-7xl px-4 py-14 lg:px-8">

        <div className="grid gap-12 lg:grid-cols-[1.5fr_repeat(3,1fr)]">

          <div>
            <Link href="/" className="inline-block">
              <Image
                src="/logo.svg"
                alt="عرب تريد"
                width={155}
                height={42}
                className="h-auto w-[155px]"
              />
            </Link>

            <p className="mt-5 max-w-md text-sm leading-8 text-white/40">
              منصة عربية حديثة لمتابعة الأسواق وتجربة التداول والاستثمار
              ضمن واجهة واضحة وسريعة ومصممة للمستخدم العصري.
            </p>

            <div className="mt-6 flex items-center gap-2">
              {[
                ["f", "#"],
                ["✈", "#"],
                ["𝕏", "#"],
              ].map(([icon, href], index) => (
                <a
                  key={index}
                  href={href}
                  aria-label="Social link"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/50 transition hover:border-blue-400/30 hover:bg-blue-500/10 hover:text-blue-400"
                >
                  <span className="text-sm font-bold">{icon}</span>
                </a>
              ))}
            </div>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-bold text-white">
                {column.title}
              </h3>

              <div className="mt-5 flex flex-col gap-3">
                {column.links.map(([label, href]) => (
                  <Link
                    key={label}
                    href={href}
                    className="text-sm text-white/40 transition hover:text-[#3b82f6]"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}

        </div>

        <div className="mt-12 border-t border-white/5 pt-6">
          <div className="flex flex-col gap-3 text-xs leading-6 text-white/25 md:flex-row md:items-center md:justify-between">

            <span>
              © 2026 عرب تريد. جميع الحقوق محفوظة.
            </span>

            <span className="max-w-3xl">
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