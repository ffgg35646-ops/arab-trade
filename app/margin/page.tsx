"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

type Asset = {
  symbol?: string;
  name?: string;
  current_price?: number;
  price_change_percentage_24h?: number;
};

type Balance = {
  asset?: string;
  free?: number;
  available?: number;
  balance?: number;
  locked?: number;
};

function n(value: unknown) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function money(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function qty(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 8,
  });
}

function getBalanceValue(item?: Balance) {
  return n(
    item?.free ??
      item?.available ??
      item?.balance ??
      0
  );
}

export default function MarginPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [selected, setSelected] = useState("BTC");
  const [side, setSide] =
    useState<"long" | "short">("long");
  const [leverage, setLeverage] = useState(3);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [assetsRes, walletRes] =
          await Promise.all([
            fetch("/api/assets", {
              cache: "no-store",
            }),
            fetch("/api/wallet", {
              cache: "no-store",
            }),
          ]);

        const assetsJson = await assetsRes.json();
        const walletJson = await walletRes.json();

        const assetList =
          Array.isArray(assetsJson)
            ? assetsJson
            : assetsJson?.assets ||
              assetsJson?.data ||
              [];

        const walletList =
          Array.isArray(walletJson)
            ? walletJson
            : walletJson?.wallet ||
              walletJson?.spot ||
              walletJson?.data ||
              [];

        setAssets(assetList);
        setBalances(walletList);
      } catch {
        setError(
          "تعذر تحميل بيانات المحفظة والأصول."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const selectedAsset = useMemo(() => {
    return (
      assets.find(
        (asset) =>
          String(asset.symbol || "")
            .toUpperCase() === selected
      ) || null
    );
  }, [assets, selected]);

  const usdtBalance = useMemo(() => {
    const item = balances.find(
      (balance) =>
        String(balance.asset || "")
          .toUpperCase() === "USDT"
    );

    return getBalanceValue(item);
  }, [balances]);

  const selectedBalance = useMemo(() => {
    const item = balances.find(
      (balance) =>
        String(balance.asset || "")
          .toUpperCase() === selected
    );

    return getBalanceValue(item);
  }, [balances, selected]);

  const price = n(
    selectedAsset?.current_price
  );

  const tradeAmount = n(amount);
  const positionValue =
    tradeAmount * leverage;

  const estimatedLiquidation =
    side === "long"
      ? price > 0
        ? price * (1 - 1 / leverage * 0.85)
        : 0
      : price > 0
      ? price * (1 + 1 / leverage * 0.85)
      : 0;

  const coins = assets
    .filter((asset) => asset.symbol)
    .slice(0, 12);

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#050a13] text-white"
    >
      <Navbar />

      <main className="mx-auto max-w-[1500px] px-4 py-6">
        {error && (
          <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="mb-7">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold">
                  التداول بالهامش
                </h1>

                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1 text-[10px] text-cyan-400">
                  MARGIN
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-500">
                استخدم الرافعة المالية لتكبير حجم مركزك
                مقارنة برأس مالك المتاح.
              </p>
            </div>

            <Link
              href="/protrade"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-slate-300 hover:border-cyan-400/20 hover:text-cyan-400"
            >
              العودة إلى التداول الفوري
            </Link>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="text-xs text-slate-500">
              رأس المال المتاح
            </div>

            <div className="mt-3 text-2xl font-bold">
              {money(usdtBalance)}
              <span className="mr-2 text-xs font-normal text-slate-500">
                USDT
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="text-xs text-slate-500">
              قيمة المركز
            </div>

            <div className="mt-3 text-2xl font-bold">
              {money(positionValue)}
              <span className="mr-2 text-xs font-normal text-slate-500">
                USDT
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="text-xs text-slate-500">
              الرافعة الحالية
            </div>

            <div className="mt-3 text-2xl font-bold text-cyan-400">
              {leverage}x
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="text-xs text-slate-500">
              مستوى التصفية التقديري
            </div>

            <div className="mt-3 text-2xl font-bold text-amber-400">
              {estimatedLiquidation
                ? money(estimatedLiquidation)
                : "--"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_380px] gap-4">
          <aside className="rounded-2xl border border-white/10 bg-[#07101d] overflow-hidden">
            <div className="border-b border-white/10 px-4 py-4">
              <h2 className="font-bold">
                أصول التداول
              </h2>

              <p className="mt-1 text-[10px] text-slate-600">
                اختر الأصل الذي تريد التداول عليه
              </p>
            </div>

            <div className="p-2">
              {loading ? (
                <div className="py-10 text-center text-xs text-slate-600">
                  جاري التحميل...
                </div>
              ) : coins.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-600">
                  لا توجد أصول متاحة
                </div>
              ) : (
                coins.map((asset) => {
                  const symbol =
                    String(
                      asset.symbol || ""
                    ).toUpperCase();

                  const change = n(
                    asset.price_change_percentage_24h
                  );

                  return (
                    <button
                      key={symbol}
                      onClick={() =>
                        setSelected(symbol)
                      }
                      className={`w-full rounded-xl px-3 py-3 text-right transition ${
                        selected === symbol
                          ? "bg-cyan-400/10 border border-cyan-400/20"
                          : "border border-transparent hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">
                          {symbol}
                        </span>

                        <span
                          className={`text-[10px] ${
                            change >= 0
                              ? "text-cyan-400"
                              : "text-red-400"
                          }`}
                        >
                          {change >= 0
                            ? "+"
                            : ""}
                          {change.toFixed(2)}%
                        </span>
                      </div>

                      <div className="mt-1 text-[11px] text-slate-500">
                        {money(
                          n(
                            asset.current_price
                          )
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#07101d] overflow-hidden">
              <div className="border-b border-white/10 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500">
                      زوج التداول
                    </div>

                    <div className="mt-1 text-xl font-bold">
                      {selected}/USDT
                    </div>
                  </div>

                  <div className="text-left">
                    <div className="text-xl font-bold text-cyan-400">
                      {price
                        ? money(price)
                        : "--"}
                    </div>

                    <div className="text-[10px] text-slate-600">
                      السعر المرجعي
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5">
                <div className="h-[390px] rounded-2xl border border-white/5 bg-[#050a13] relative overflow-hidden">
                  <div className="absolute inset-0 opacity-30 bg-[linear-gradient(rgba(148,163,184,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.08)_1px,transparent_1px)] bg-[size:50px_50px]" />

                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-5xl font-bold text-slate-800">
                        {selected}/USDT
                      </div>

                      <div className="mt-3 text-xs text-slate-600">
                        حركة السوق التفصيلي متاح من
                        شاشة التداول الاحترافي
                      </div>

                      <Link
                        href={`/protrade/${selected}_USDT`}
                        className="mt-5 inline-block rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-2 text-xs text-cyan-400"
                      >
                        فتح حركة السوق
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
              <h2 className="font-bold">
                محفظة الهامش
              </h2>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-black/20 border border-white/5 p-4">
                  <div className="text-[10px] text-slate-600">
                    USDT المتاح
                  </div>

                  <div className="mt-2 font-semibold">
                    {money(usdtBalance)}
                  </div>
                </div>

                <div className="rounded-xl bg-black/20 border border-white/5 p-4">
                  <div className="text-[10px] text-slate-600">
                    {selected} المتاح
                  </div>

                  <div className="mt-2 font-semibold">
                    {qty(selectedBalance)}
                  </div>
                </div>

                <div className="rounded-xl bg-black/20 border border-white/5 p-4">
                  <div className="text-[10px] text-slate-600">
                    نسبة المخاطر
                  </div>

                  <div className="mt-2 font-semibold text-emerald-400">
                    منخفضة
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="rounded-2xl border border-white/10 bg-[#07101d] overflow-hidden">
            <div className="border-b border-white/10 px-5 py-4">
              <h2 className="font-bold">
                فتح مركز هامش
              </h2>

              <p className="mt-1 text-[10px] text-slate-600">
                إعدادات المركز
              </p>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 rounded-xl bg-black/20 p-1 border border-white/5">
                <button
                  onClick={() => setSide("long")}
                  className={`rounded-lg py-3 text-xs font-bold ${
                    side === "long"
                      ? "bg-cyan-400 text-[#041019]"
                      : "text-slate-500"
                  }`}
                >
                  شراء / Long
                </button>

                <button
                  onClick={() => setSide("short")}
                  className={`rounded-lg py-3 text-xs font-bold ${
                    side === "short"
                      ? "bg-red-500 text-white"
                      : "text-slate-500"
                  }`}
                >
                  بيع / Short
                </button>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    الرافعة
                  </span>

                  <span className="text-sm font-bold text-cyan-400">
                    {leverage}x
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {[2, 3, 5, 10].map((value) => (
                    <button
                      key={value}
                      onClick={() =>
                        setLeverage(value)
                      }
                      className={`rounded-lg border py-2 text-xs ${
                        leverage === value
                          ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-400"
                          : "border-white/10 text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {value}x
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs text-slate-500">
                  حجم الهامش
                </label>

                <div className="flex items-center rounded-xl border border-white/10 bg-black/20 px-3">
                  <input
                    value={amount}
                    onChange={(e) =>
                      setAmount(e.target.value)
                    }
                    inputMode="decimal"
                    placeholder="0.00"
                    className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />

                  <span className="text-xs text-slate-500">
                    USDT
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {[25, 50, 75, 100].map(
                  (percent) => (
                    <button
                      key={percent}
                      onClick={() =>
                        setAmount(
                          (
                            (usdtBalance *
                              percent) /
                            100
                          ).toFixed(2)
                        )
                      }
                      className="rounded-lg border border-white/10 py-2 text-[10px] text-slate-500 hover:text-cyan-400"
                    >
                      {percent}%
                    </button>
                  )
                )}
              </div>

              <div className="space-y-3 rounded-xl border border-white/5 bg-black/20 p-4">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">
                    الهامش
                  </span>

                  <span>
                    {money(tradeAmount)} USDT
                  </span>
                </div>

                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">
                    الرافعة
                  </span>

                  <span>{leverage}x</span>
                </div>

                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">
                    قيمة المركز
                  </span>

                  <span>
                    {money(positionValue)} USDT
                  </span>
                </div>

                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">
                    التصفية التقديرية
                  </span>

                  <span className="text-amber-400">
                    {estimatedLiquidation
                      ? money(
                          estimatedLiquidation
                        )
                      : "--"}
                  </span>
                </div>
              </div>

              <button
                disabled
                className={`h-12 w-full rounded-xl font-bold text-sm opacity-50 cursor-not-allowed ${
                  side === "long"
                    ? "bg-cyan-400 text-[#041019]"
                    : "bg-red-500 text-white"
                }`}
              >
                فتح مركز
              </button>

              <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 p-4 text-[10px] leading-5 text-amber-400/70">
                محرك تنفيذ الهامش والاقتراض والتصفية
                غير مربوط حاليًا بواجهة API مخصصة في
                المشروع، لذلك زر فتح المركز متوقف بدل
                تنفيذ عملية وهمية.
              </div>
            </div>
          </aside>
        </div>

        <section className="mt-4 rounded-2xl border border-white/10 bg-[#07101d] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">
                مراكز الهامش
              </h2>

              <p className="mt-1 text-[10px] text-slate-600">
                المراكز المفتوحة ستظهر هنا بعد ربط محرك
                Margin Engine.
              </p>
            </div>

            <div className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-slate-600">
              لا توجد مراكز مفتوحة
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}