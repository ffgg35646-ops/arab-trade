import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function MarketsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
