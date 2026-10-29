"use client";

import { usePathname } from "next/navigation";
import Footer from "@/components/Footer";

const pagesWithTheirOwnFooter = new Set(["/", "/about", "/licenses"]);
const internalWorkspacePrefixes = ["/dashboard", "/admin", "/protrade", "/margin", "/futures"];

function isInternalWorkspace(pathname: string) {
  return internalWorkspacePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default function GlobalFooter() {
  const pathname = usePathname();

  if (pagesWithTheirOwnFooter.has(pathname) || isInternalWorkspace(pathname)) {
    return null;
  }

  return <Footer />;
}
