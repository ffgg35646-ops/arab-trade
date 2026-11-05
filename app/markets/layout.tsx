import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function MarketsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-[#e9edef] text-[#172126]">
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
