import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProTradeTerminal from "@/components/ProTradeTerminal";

export default function PublicSpotTradingPage() {
  return (
    <div dir="rtl" className="min-h-screen overflow-x-hidden bg-[#050a13] text-white">
      <Navbar />
      <ProTradeTerminal />
      <Footer />
    </div>
  );
}
