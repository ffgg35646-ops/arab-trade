import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProTradeTerminal from "@/components/ProTradeTerminal";

export default function PublicSpotTradingPage() {
  return (
    <div dir="rtl" className="min-h-screen overflow-x-hidden bg-[#e9edef] text-[#172126]">
      <Navbar />
      <ProTradeTerminal />
      <Footer />
    </div>
  );
}
