import Hero from "@/components/Hero";
import MarketTerminal from "@/components/MarketTerminal";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export default function HomePage() {
  return (
    <div dir="rtl" className="equiti-home min-h-screen overflow-x-hidden bg-[#e5e7e8] text-[#172126]">
      <Navbar />

      <main className="equiti-home-content">
        <Hero />

        <MarketTerminal />

        <section id="markets" className="mx-auto max-w-7xl px-4 py-20 text-[#172126] lg:px-8">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 text-xs font-bold text-[#008f89]">
                LIVE MARKETS
              </div>

              <h2 className="text-3xl font-black text-[#172126] sm:text-4xl">
                أهم الأسواق الآن
              </h2>

              <p className="mt-3 text-sm leading-7 text-[#4f5d63]">
                تابع حركة أبرز الأصول والأسعار والتغيرات اليومية من مكان واحد.
              </p>
            </div>

            <button className="w-fit rounded-xl border border-[#cbd2d4] bg-[#dfe3e4] px-4 py-2 text-sm font-bold text-[#344248] transition hover:bg-[#f3f7f7]">
              عرض جميع الأسواق
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#c7ced0] bg-[#d8dddf]">
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 border-b border-[#c7ced0] px-5 py-4 text-xs font-semibold text-[#526168]">
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
                className="grid grid-cols-[1.5fr_1fr_1fr_1fr] items-center gap-4 border-b border-[#d0d6d8] bg-[#e7eaeb] px-5 py-5 last:border-0 hover:bg-[#dfe4e5]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e5f4f2] text-xs font-black text-[#008f89]">
                    {symbol.slice(0, 2)}
                  </div>

                  <div>
                    <div className="text-sm font-bold text-[#172126]">{name}</div>
                    <div className="mt-0.5 text-[11px] text-[#526168]">
                      {symbol}/USDT
                    </div>
                  </div>
                </div>

                <span className="text-sm font-semibold text-[#26343a]">{price}</span>

                <span
                  className={`text-sm font-bold ${
                    change.startsWith("+")
                      ? "text-[#22c55e]"
                      : "text-[#ef4444]"
                  }`}
                >
                  {change}
                </span>

                <span className="text-sm text-[#4f5d63]">{volume}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="trading" className="mx-auto max-w-7xl px-4 pb-20 text-[#172126] lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {[
              ["أدوات تداول متقدمة", "راقب السوق وحلل الحركة عبر واجهة واضحة وسريعة."],
              ["أسعار وتحركات مباشرة", "تابع الأصول المهمة بدون مغادرة المنصة."],
              ["تجربة مصممة للسرعة", "تنقل سهل وواجهة مناسبة للكمبيوتر والهاتف."],
            ].map(([title, description]) => (
              <div
                key={title}
                className="rounded-2xl border border-[#cbd2d4] bg-[#dce1e2] px-6 py-7 shadow-sm"
              >
                <div className="h-1 w-12 rounded-full bg-[#00a39b]" />
                <h3 className="mt-5 text-lg font-extrabold text-[#172126]">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#4f5d63]">
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
          <div className="relative overflow-hidden rounded-[28px] border border-[#c7ced0] bg-[#d8dddf] shadow-sm px-6 py-12 sm:px-12 sm:py-16">
            <div className="max-w-3xl">
              <div className="text-xs font-bold tracking-wide text-[#008f89]">
                منصة واحدة • تجربة متكاملة
              </div>

              <h2 className="mt-4 text-3xl font-black leading-tight text-[#172126] sm:text-4xl">
                كل ما تحتاجه لمتابعة السوق في مكان واحد
              </h2>

              <p className="mt-5 text-sm leading-8 text-[#46545b] sm:text-base">
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