import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function MarketsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-[#e5e7e8] text-[#172126]">
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
