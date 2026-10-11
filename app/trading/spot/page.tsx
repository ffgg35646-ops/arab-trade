import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MarketTerminal from "@/components/MarketTerminal";

export default function SpotTradingPage() {
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#050a13] text-white"
    >
      <Navbar />

      <div className="pt-24">
        <section className="border-b border-white/[0.06] bg-[#07101d]">
          <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-cyan-400">
                SPOT TRADING
              </span>

              <h1 className="text-3xl font-black">
                السوق الفوري
              </h1>

              <p className="max-w-2xl text-sm leading-7 text-white/40">
                تداول ومتابعة أزواج السوق الفوري من خلال واجهة السوق المخصصة
                لهذا القسم فقط.
              </p>
            </div>
          </div>
        </section>

        <MarketTerminal />
      </div>

      <Footer />
    </main>
  );
}