 "use client";

import { useEffect, useState } from "react";

const slides = [
  {
    image:
      "https://images.unsplash.com/photo-1642790106117-e829e14a795f?auto=format&fit=crop&w=1400&q=85",
    label: "الأسواق العالمية",
    title: "تابع حركة السوق لحظة بلحظة",
    text: "بيانات الأسواق والعملات الرقمية في واجهة واحدة سريعة وواضحة.",
  },
  {
    image:
      "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1400&q=85",
    label: "تداول أذكى",
    title: "قراراتك تبدأ من البيانات",
    text: "راقب الأسعار والحركة والأداء من خلال أدوات مصممة للمتداول.",
  },
  {
    image:
      "https://images.unsplash.com/photo-1621761191319-c6fb62004040?auto=format&fit=crop&w=1400&q=85",
    label: "العملات الرقمية",
    title: "كل الأسواق أمامك",
    text: "اكتشف أهم العملات والأصول وتابع تغيراتها بسهولة.",
  },
];

export default function Hero() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((current) => (current + 1) % slides.length);
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const slide = slides[active];

  return (
    <section
      dir="rtl"
      className="relative overflow-hidden bg-[#050a13] px-4 pb-8 pt-14 sm:px-6 lg:px-8"
    >
      <div className="arabtrade-crypto-bg" aria-hidden="true">
        <div className="arabtrade-trade-arrows" />
      </div>

      <div className="arabtrade-hero-content mx-auto max-w-[1500px]">

        <div className="grid min-h-[560px] items-center gap-8 overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#07101d] p-4 shadow-[0_30px_100px_rgba(0,0,0,.45)] sm:p-7 lg:grid-cols-[1fr_1.05fr] lg:p-10">

          {/* النص */}
          <div className="relative z-10 order-2 max-w-2xl lg:order-1">

            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/[0.07] px-4 py-2 text-xs font-bold text-blue-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              الأسواق تعمل الآن
            </div>

            <h1 className="text-4xl font-black leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-7xl">
              تداول
              <span className="block bg-gradient-to-l from-blue-400 via-cyan-300 to-white bg-clip-text text-transparent">
                بذكاء
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-white/50 sm:text-lg">
              منصة عربية حديثة لمتابعة الأسواق والعملات الرقمية،
              مع بيانات مباشرة وأدوات تساعدك على فهم حركة السوق.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button className="rounded-xl bg-blue-500 px-7 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5 hover:bg-blue-400">
                ابدأ الآن
              </button>

              <button className="rounded-xl border border-white/10 bg-[#07101d]/[0.04] px-7 py-3.5 text-sm font-bold text-white transition hover:bg-[#07101d]/[0.08]">
                استكشف الأسواق
              </button>
            </div>

            <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/[0.07] bg-[#07101d]/[0.025] p-4">
                <div className="text-xl font-black text-white">100+</div>
                <div className="mt-1 text-[11px] text-white/35">
                  أصل رقمي
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-[#07101d]/[0.025] p-4">
                <div className="text-xl font-black text-white">
                  مباشر
                </div>
                <div className="mt-1 text-[11px] text-white/35">
                  بيانات السوق
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-[#07101d]/[0.025] p-4">
                <div className="text-xl font-black text-white">
                  24/7
                </div>
                <div className="mt-1 text-[11px] text-white/35">
                  متابعة مستمرة
                </div>
              </div>
            </div>
          </div>

          {/* السلايدر */}
          <div className="relative order-1 h-[350px] overflow-hidden rounded-[24px] border border-white/10 bg-[#050a13] sm:h-[430px] lg:order-2 lg:h-[500px]">

            {/* الصورة */}
            {slides.map((item, index) => (
              <div
                key={item.image}
                className={`absolute inset-0 transition-all duration-1000 ${
                  index === active
                    ? "scale-100 opacity-100"
                    : "scale-110 opacity-0"
                }`}
              >
                <img
                  src={item.image}
                  alt={item.title}
                  className="h-full w-full object-cover"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-[#050a13] via-[#050a13]/35 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-l from-blue-950/30 to-transparent" />
              </div>
            ))}

            {/* زخارف */}
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-500/20 blur-[80px]" />
            <div className="absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-cyan-400/10 blur-[70px]" />

            {/* بيانات السلايد */}
            <div
              key={active}
              className="absolute bottom-0 right-0 left-0 p-6 sm:p-8"
            >
              <div className="mb-3 inline-flex rounded-lg border border-white/10 bg-[#050a13]/30 px-3 py-1.5 text-[10px] font-bold text-cyan-300 backdrop-blur-md">
                {slide.label}
              </div>

              <h2 className="max-w-lg text-2xl font-black leading-tight text-white sm:text-3xl">
                {slide.title}
              </h2>

              <p className="mt-3 max-w-lg text-xs leading-6 text-white/55 sm:text-sm">
                {slide.text}
              </p>
            </div>

            {/* الأسهم */}
            <div className="absolute bottom-7 left-6 flex gap-2">
              <button
                aria-label="السابق"
                onClick={() =>
                  setActive(
                    (active - 1 + slides.length) % slides.length
                  )
                }
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#050a13]/30 text-white backdrop-blur-md transition hover:bg-[#07101d]/10"
              >
                →
              </button>

              <button
                aria-label="التالي"
                onClick={() =>
                  setActive((active + 1) % slides.length)
                }
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#050a13]/30 text-white backdrop-blur-md transition hover:bg-[#07101d]/10"
              >
                ←
              </button>
            </div>

            {/* النقاط */}
            <div className="absolute bottom-8 right-6 flex items-center gap-1.5">
              {slides.map((_, index) => (
                <button
                  key={index}
                  aria-label={`الشريحة ${index + 1}`}
                  onClick={() => setActive(index)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === active
                      ? "w-8 bg-blue-400"
                      : "w-1.5 bg-[#07101d]/30"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}