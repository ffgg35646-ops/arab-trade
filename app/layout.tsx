import type { Metadata } from "next";
import "./globals.css";
import BottomNavigation from "@/components/BottomNavigation";
import GlobalSuccessToast from "@/components/GlobalSuccessToast";

export const metadata: Metadata = {
  title: "عرب تريد | منصة التداول والاستثمار",
  description:
    "منصة عربية حديثة لمتابعة الأسواق والتداول والاستثمار.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="pb-24 md:pb-0">
        {children}
        <GlobalSuccessToast />
        <BottomNavigation />
      </body>
    </html>
  );
}