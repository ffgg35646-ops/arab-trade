import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNavigation from "@/components/BottomNavigation";
import GlobalSuccessToast from "@/components/GlobalSuccessToast";
import GlobalFooter from "@/components/GlobalFooter";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "EQUITI TRADE HUB",
  description: "EQUITI TRADE HUB — منصة التداول.",
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
        <GlobalFooter />
        <GlobalSuccessToast />
        <BottomNavigation />
      </body>
    </html>
  );
}
