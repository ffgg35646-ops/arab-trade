import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SpotStrategyTerminal from "@/components/SpotStrategyTerminal";

export default function SpotStrategyPage() {
  return (
    <div dir="rtl" className="min-h-screen overflow-x-hidden bg-[#050a13] text-white">
      <Navbar />
      <SpotStrategyTerminal />
      <Footer />
    </div>
  );
}
