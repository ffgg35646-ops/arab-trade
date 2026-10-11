import Hero from "@/components/Hero";
import MarketTerminal from "@/components/MarketTerminal";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export default function HomePage() {
  return (
    <div dir="rtl" className="min-h-screen overflow-x-hidden bg-[#050a13] text-white">
      <Navbar />

      <main>
        <Hero />

        <MarketTerminal />

        <section id="markets" className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 text-xs font-bold text-[#3b82f6]">
                LIVE MARKETS
              </div>

              <h2 className="text-3xl font-black text-white sm:text-4xl">
                أهم الأسواق الآن
              </h2>

              <p className="mt-3 text-sm leading-7 text-white/40">
                تابع حركة أبرز الأصول والأسعار والتغيرات اليومية من مكان واحد.
              </p>
            </div>

            <button className="w-fit rounded-xl border border-white/10 bg-[#07101d]/[0.03] px-4 py-2 text-sm font-bold text-white/70">
              عرض جميع الأسواق
            </button>
          </div>

          <div className="overflow-hidden rounded-[24px] border border-white/5 bg-[#07101d]">
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 border-b border-white/5 px-5 py-4 text-xs font-semibold text-white/30">
              <span>الأصل</span>
              <span>السعر</span>
              <span>التغير 24س</span>
              <span>الحجم</span>
            </div>

            {[
              ["Bitcoin", "BTC", "$118,240.42", "+2.43%", "$42.8B"],
              ["Ethereum", "ETH", "$4,521.88", "+1.87%", "$21.4B"],
              ["Solana", "SOL", "$201.74", "-0.64%", "$5.8B"],
              ["BNB", "BNB", "$712.30", "+1.12%", "$2.9B"],
              ["XRP", "XRP", "$2.74", "+3.28%", "$7.3B"],
            ].map(([name, symbol, price, change, volume]) => (
              <div
                key={symbol}
                className="grid grid-cols-[1.5fr_1fr_1fr_1fr] items-center gap-4 border-b border-white/[0.04] px-5 py-5 last:border-0 hover:bg-[#07101d]/[0.02]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#07101d]/[0.05] text-xs font-black text-[#3b82f6]">
                    {symbol.slice(0, 2)}
                  </div>

                  <div>
                    <div className="text-sm font-bold text-white">{name}</div>
                    <div className="mt-0.5 text-[11px] text-white/30">
                      {symbol}/USDT
                    </div>
                  </div>
                </div>

                <span className="text-sm font-semibold text-white">{price}</span>

                <span
                  className={`text-sm font-bold ${
                    change.startsWith("+")
                      ? "text-[#22c55e]"
                      : "text-[#ef4444]"
                  }`}
                >
                  {change}
                </span>

                <span className="text-sm text-white/45">{volume}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="trading" className="mx-auto max-w-7xl px-4 pb-20 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {[
              ["أدوات تداول متقدمة", "راقب السوق وحلل الحركة عبر واجهة واضحة وسريعة."],
              ["أسعار وتحركات مباشرة", "تابع الأصول المهمة بدون مغادرة المنصة."],
              ["تجربة مصممة للسرعة", "تنقل سهل وواجهة مناسبة للكمبيوتر والهاتف."],
            ].map(([title, description]) => (
              <div
                key={title}
                className="rounded-[24px] border border-white/5 bg-[#07101d] p-6"
              >
                <div className="h-11 w-11 rounded-2xl bg-[#3b82f6]/10" />
                <h3 className="mt-6 text-lg font-extrabold text-white">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/40">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="about"
          className="mx-auto max-w-7xl px-4 pb-20 lg:px-8"
        >
          <div className="rounded-[28px] border border-[#3b82f6]/10 bg-gradient-to-r from-[#3b82f6]/10 via-transparent to-transparent p-8 sm:p-12">
            <div className="max-w-3xl">
              <div className="text-xs font-bold text-[#3b82f6]">
                منصة واحدة • تجربة متكاملة
              </div>

              <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">
                كل ما تحتاجه لمتابعة السوق في مكان واحد
              </h2>

              <p className="mt-5 text-sm leading-8 text-white/40 sm:text-base">
                من متابعة الأسعار إلى دراسة حركة السوق واكتشاف الفرص، تم تصميم
                عرب تريد لتكون واجهة مالية حديثة وسهلة الاستخدام.
              </p>
            </div>
          </div>
        </section>
      </main>

      <div id="contact">
        <Footer />
      </div>
    </div>
  );
}