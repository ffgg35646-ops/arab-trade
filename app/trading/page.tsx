import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import TradingTerminal from "@/components/TradingTerminal";

export default function TradingPage() {
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#050a13] text-white"
    >
      <Navbar />

      <section className="relative overflow-hidden px-3 pb-12 pt-24 sm:px-5 lg:px-6">

        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          aria-hidden="true"
        >
          <div className="absolute -left-40 top-20 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute -right-40 top-60 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto max-w-[1600px]">

          <div className="mb-5">
            <h1 className="text-2xl font-black sm:text-3xl">
              التداول
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              منصة تداول احترافية لمتابعة الأسواق والأزواج المتاحة.
            </p>
          </div>

          <TradingTerminal />

        </div>
      </section>

      <Footer />
    </main>
  );
}