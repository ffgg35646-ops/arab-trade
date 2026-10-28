"use client";

import { usePathname } from "next/navigation";
import Footer from "@/components/Footer";

const pagesWithTheirOwnFooter = new Set(["/", "/about", "/licenses"]);

export default function GlobalFooter() {
  const pathname = usePathname();

  if (pagesWithTheirOwnFooter.has(pathname)) {
    return null;
  }

  return <Footer />;
}
