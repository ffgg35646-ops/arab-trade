import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import TradingMenu from "@/components/TradingMenu";

export default function TradingPage() {
  return (
    <div dir="rtl" className="min-h-screen overflow-x-hidden bg-[#050a13] text-white">
      <Navbar />
      <main><TradingMenu /></main>
      <Footer />
    </div>
  );
}
