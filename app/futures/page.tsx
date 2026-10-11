"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Coin = {
  id?: string;
  symbol?: string;
  name?: string;
  current_price?: number;
  price_change_percentage_24h?: number | null;
};

type Position = {
  _id?: string;
  symbol?: string;
  side?: "long" | "short" | string;
  quantity?: number;
  entryPrice?: number;
  markPrice?: number;
  leverage?: number;
  marginMode?: "isolated" | "cross" | string;
  margin?: number;
  pnl?: number;
  liquidationPrice?: number;
  status?: "open" | "closed" | "liquidated" | string;
  createdAt?: string;
};

type FuturesOrder = {
  _id?: string;
  symbol?: string;
  side?: "long" | "short" | string;
  type?: "limit" | "market" | string;
  quantity?: number;
  price?: number;
  leverage?: number;
  marginMode?: string;
  reduceOnly?: boolean;
  status?: "open" | "filled" | "cancelled" | "rejected" | string;
  createdAt?: string;
};

type FundingPayment = {
  _id?: string;
  symbol?: string;
  notional?: number;
  fundingRate?: number;
  amount?: number;
  status?: string;
  createdAt?: string;
};

type MarketResponse = {
  coins?: Coin[];
};

function number(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(
  value: unknown,
  digits = 8
) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      maximumFractionDigits: digits,
    }
  ).format(n);
}

function formatDate(
  value: unknown
) {
  if (!value) return "—";

  const date = new Date(
    String(value)
  );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "ar-EG",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}

function statusLabel(value: unknown) {
  switch (
    String(value || "")
      .toLowerCase()
  ) {
    case "open":
      return "مفتوح";
    case "filled":
      return "مكتمل";
    case "cancelled":
      return "ملغي";
    case "rejected":
      return "مرفوض";
    case "closed":
      return "مغلق";
    case "liquidated":
      return "مصفى";
    case "pending":
      return "معلق";
    default:
      return value
        ? String(value)
        : "—";
  }
}

export default function FuturesPage() {
  const [coins, setCoins] =
    useState<Coin[]>([]);

  const [positions, setPositions] =
    useState<Position[]>([]);

  const [orders, setOrders] =
    useState<FuturesOrder[]>([]);

  const [funding, setFunding] =
    useState<FundingPayment[]>([]);

  const [selectedSymbol, setSelectedSymbol] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [actionError, setActionError] =
    useState("");

  const [opening, setOpening] =
    useState(false);

  const [closingId, setClosingId] =
    useState("");

  const [cancellingId, setCancellingId] =
    useState("");

  const [openSide, setOpenSide] =
    useState<"long" | "short">(
      "long"
    );

  const [quantity, setQuantity] =
    useState("");

  const [leverage, setLeverage] =
    useState("10");

  const [marginMode, setMarginMode] =
    useState<"isolated" | "cross">(
      "isolated"
    );

  const [entryPrice, setEntryPrice] =
    useState("");

  const selectedCoin =
    useMemo(
      () =>
        coins.find(
          (coin) =>
            String(
              coin.symbol || ""
            ).toUpperCase() ===
            selectedSymbol
        ) || null,
      [coins, selectedSymbol]
    );

  const loadData = useCallback(
    async (
      silent = false
    ) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const [
          marketResponse,
          positionsResponse,
          ordersResponse,
          fundingResponse,
        ] = await Promise.all([
          fetch("/api/market", {
            cache: "no-store",
          }),

          fetch(
            "/api/futures/positions",
            {
              credentials: "include",
              cache: "no-store",
            }
          ),

          fetch(
            "/api/futures/orders",
            {
              credentials: "include",
              cache: "no-store",
            }
          ),

          fetch(
            "/api/futures/funding",
            {
              credentials: "include",
              cache: "no-store",
            }
          ),
        ]);

        if (!marketResponse.ok) {
          throw new Error(
            "تعذر تحميل بيانات السوق."
          );
        }

        const marketJson =
          (await marketResponse.json()) as MarketResponse;

        const nextCoins =
          Array.isArray(
            marketJson.coins
          )
            ? marketJson.coins
            : [];

        setCoins(nextCoins);

        if (
          !selectedSymbol &&
          nextCoins.length
        ) {
          const first =
            String(
              nextCoins[0]
                ?.symbol || ""
            ).toUpperCase();

          if (first) {
            setSelectedSymbol(
              `${first}USDT`
            );
          }
        }

        if (positionsResponse.ok) {
          const json =
            await positionsResponse.json();

          setPositions(
            Array.isArray(
              json?.positions
            )
              ? json.positions
              : []
          );
        }

        if (ordersResponse.ok) {
          const json =
            await ordersResponse.json();

          setOrders(
            Array.isArray(
              json?.orders
            )
              ? json.orders
              : []
          );
        }

        if (fundingResponse.ok) {
          const json =
            await fundingResponse.json();

          setFunding(
            Array.isArray(
              json?.payments
            )
              ? json.payments
              : []
          );
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "تعذر تحميل بيانات العقود."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedSymbol]
  );

  useEffect(() => {
    void loadData();

    const timer =
      window.setInterval(
        () => {
          void loadData(true);
        },
        7000
      );

    return () =>
      window.clearInterval(
        timer
      );
  }, [loadData]);

  useEffect(() => {
    if (selectedCoin) {
      setEntryPrice(
        number(
          selectedCoin.current_price
        ).toString()
      );
    }
  }, [selectedCoin]);

  async function openPosition() {
    const symbol =
      selectedSymbol;

    const qty =
      number(quantity);

    const price =
      number(entryPrice);

    const lev =
      number(leverage);

    if (!symbol) {
      setActionError(
        "اختر عقدًا أولًا."
      );
      return;
    }

    if (
      qty <= 0 ||
      price <= 0
    ) {
      setActionError(
        "أدخل كمية وسعرًا صحيحين."
      );
      return;
    }

    if (
      lev < 1 ||
      lev > 125
    ) {
      setActionError(
        "الرافعة يجب أن تكون بين 1 و125."
      );
      return;
    }

    try {
      setOpening(true);
      setActionError("");

      const response =
        await fetch(
          "/api/futures/open",
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              symbol,
              side: openSide,
              quantity: qty,
              entryPrice: price,
              leverage: lev,
              marginMode,
            }),
          }
        );

      const json =
        await response
          .json()
          .catch(() => ({}));

      if (
        !response.ok ||
        !json?.success
      ) {
        throw new Error(
          json?.error ||
            json?.message ||
            "تعذر فتح المركز."
        );
      }

      setQuantity("");
      await loadData(true);
    } catch (openError) {
      setActionError(
        openError instanceof Error
          ? openError.message
          : "تعذر فتح المركز."
      );
    } finally {
      setOpening(false);
    }
  }

  async function closePosition(
    position: Position
  ) {
    const id =
      String(
        position._id || ""
      );

    if (!id) return;

    const exitPrice =
      number(
        selectedCoin?.current_price ||
          position.markPrice
      );

    if (exitPrice <= 0) {
      setActionError(
        "سعر الإغلاق غير صالح."
      );
      return;
    }

    try {
      setClosingId(id);
      setActionError("");

      const response =
        await fetch(
          "/api/futures/close",
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              id,
              exitPrice,
            }),
          }
        );

      const json =
        await response
          .json()
          .catch(() => ({}));

      if (
        !response.ok ||
        !json?.success
      ) {
        throw new Error(
          json?.error ||
            json?.message ||
            "تعذر إغلاق المركز."
        );
      }

      await loadData(true);
    } catch (closeError) {
      setActionError(
        closeError instanceof Error
          ? closeError.message
          : "تعذر إغلاق المركز."
      );
    } finally {
      setClosingId("");
    }
  }

  async function cancelOrder(
    order: FuturesOrder
  ) {
    const id =
      String(
        order._id || ""
      );

    if (!id) return;

    try {
      setCancellingId(id);
      setActionError("");

      const response =
        await fetch(
          "/api/futures/orders/cancel",
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              id,
            }),
          }
        );

      const json =
        await response
          .json()
          .catch(() => ({}));

      if (
        !response.ok ||
        !json?.success
      ) {
        throw new Error(
          json?.error ||
            json?.message ||
            "تعذر إلغاء الأمر."
        );
      }

      await loadData(true);
    } catch (cancelError) {
      setActionError(
        cancelError instanceof Error
          ? cancelError.message
          : "تعذر إلغاء الأمر."
      );
    } finally {
      setCancellingId("");
    }
  }

  const openPositions =
    positions.filter(
      (position) =>
        String(
          position.status || ""
        ).toLowerCase() ===
        "open"
    );

  const openOrders =
    orders.filter(
      (order) =>
        String(
          order.status || ""
        ).toLowerCase() ===
        "open"
    );

  const totalPnl =
    openPositions.reduce(
      (sum, position) =>
        sum +
        number(position.pnl),
      0
    );

  const totalMargin =
    openPositions.reduce(
      (sum, position) =>
        sum +
        number(position.margin),
      0
    );

  const latestFunding =
    funding.slice(0, 5);

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#050a13] text-white"
    >
      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-6 lg:px-8">

        <div className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-[0.22em] text-cyan-400">
              ARABTRADE FUTURES
            </div>

            <h1 className="mt-2 text-3xl font-black md:text-4xl">
              العقود الآجلة
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
              إدارة المراكز والأوامر والرافعة المالية من خلال بيانات العقود
              الحقيقية الموجودة في حسابك.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/protrade"
              className="rounded-xl border border-white/10 px-4 py-3 text-xs font-semibold text-slate-300 hover:bg-white/5"
            >
              منصة التداول
            </Link>

            <button
              type="button"
              onClick={() =>
                void loadData(true)
              }
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-semibold text-slate-300 hover:bg-white/5"
            >
              <RefreshCw
                size={14}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />
              تحديث
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/[0.05] px-5 py-4 text-xs text-red-300">
            {error}
          </div>
        ) : null}

        {actionError ? (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.05] px-5 py-4 text-xs text-red-300">
            <span>{actionError}</span>

            <button
              type="button"
              onClick={() =>
                setActionError("")
              }
            >
              <X size={15} />
            </button>
          </div>
        ) : null}

        <div className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#07101d] p-2">
          {coins.slice(0, 20).map(
            (coin) => {
              const symbol =
                String(
                  coin.symbol || ""
                ).toUpperCase();

              const pair =
                `${symbol}USDT`;

              const active =
                selectedSymbol ===
                pair;

              return (
                <button
                  key={`${coin.id || symbol}-${pair}`}
                  type="button"
                  onClick={() =>
                    setSelectedSymbol(
                      pair
                    )
                  }
                  className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                    active
                      ? "bg-blue-500/15 text-cyan-300"
                      : "text-slate-500 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {symbol}/USDT
                </button>
              );
            }
          )}
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <Wallet
              size={19}
              className="text-cyan-300"
            />
            <div className="mt-4 text-[10px] text-slate-600">
              الهامش المستخدم
            </div>
            <div className="mt-3 font-mono text-2xl font-semibold text-white">
              {formatNumber(
                totalMargin,
                6
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <TrendingUp
              size={19}
              className="text-cyan-300"
            />
            <div className="mt-4 text-[10px] text-slate-600">
              المراكز المفتوحة
            </div>
            <div className="mt-3 font-mono text-2xl font-semibold text-white">
              {openPositions.length}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <ClipboardList
              size={19}
              className="text-cyan-300"
            />
            <div className="mt-4 text-[10px] text-slate-600">
              الأوامر المفتوحة
            </div>
            <div className="mt-3 font-mono text-2xl font-semibold text-white">
              {openOrders.length}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <ShieldCheck
              size={19}
              className="text-cyan-300"
            />
            <div className="mt-4 text-[10px] text-slate-600">
              الربح والخسارة الحالية
            </div>
            <div
              className={`mt-3 font-mono text-2xl font-semibold ${
                totalPnl > 0
                  ? "text-emerald-400"
                  : totalPnl < 0
                    ? "text-red-400"
                    : "text-white"
              }`}
            >
              {totalPnl > 0
                ? "+"
                : ""}
              {formatNumber(
                totalPnl,
                6
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">

          {/* تنفيذ العقود */}
          <section className="rounded-2xl border border-white/10 bg-[#07101d]">
            <div className="border-b border-white/10 p-5">
              <div className="text-sm font-bold">
                فتح مركز
              </div>
              <div className="mt-1 text-[10px] text-slate-600">
                {selectedSymbol || "اختر عقدًا"}
              </div>
            </div>

            <div className="space-y-4 p-5">

              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#050a13] p-1">
                <button
                  type="button"
                  onClick={() =>
                    setOpenSide("long")
                  }
                  className={`rounded-lg py-2.5 text-xs font-bold ${
                    openSide === "long"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "text-slate-500"
                  }`}
                >
                  Long
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setOpenSide("short")
                  }
                  className={`rounded-lg py-2.5 text-xs font-bold ${
                    openSide === "short"
                      ? "bg-red-500/10 text-red-300"
                      : "text-slate-500"
                  }`}
                >
                  Short
                </button>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[10px] text-slate-500">
                  الكمية
                </span>

                <input
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(
                      event.target.value
                    )
                  }
                  inputMode="decimal"
                  placeholder="0"
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#050a13] px-3 font-mono text-xs text-white outline-none focus:border-cyan-400/30"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] text-slate-500">
                  سعر الدخول
                </span>

                <input
                  value={entryPrice}
                  onChange={(event) =>
                    setEntryPrice(
                      event.target.value
                    )
                  }
                  inputMode="decimal"
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#050a13] px-3 font-mono text-xs text-white outline-none focus:border-cyan-400/30"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] text-slate-500">
                  الرافعة
                </span>

                <input
                  value={leverage}
                  onChange={(event) =>
                    setLeverage(
                      event.target.value
                    )
                  }
                  inputMode="numeric"
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#050a13] px-3 font-mono text-xs text-white outline-none focus:border-cyan-400/30"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] text-slate-500">
                  نوع الهامش
                </span>

                <select
                  value={marginMode}
                  onChange={(event) =>
                    setMarginMode(
                      event.target.value as
                        | "isolated"
                        | "cross"
                    )
                  }
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#050a13] px-3 text-xs text-white outline-none focus:border-cyan-400/30"
                >
                  <option value="isolated">
                    معزول
                  </option>
                  <option value="cross">
                    متقاطع
                  </option>
                </select>
              </label>

              <button
                type="button"
                onClick={() =>
                  void openPosition()
                }
                disabled={
                  opening ||
                  loading
                }
                className={`w-full rounded-xl py-3.5 text-xs font-bold transition disabled:opacity-50 ${
                  openSide === "long"
                    ? "bg-emerald-500 text-black hover:bg-emerald-400"
                    : "bg-red-500 text-white hover:bg-red-400"
                }`}
              >
                {opening
                  ? "جارٍ التنفيذ..."
                  : openSide === "long"
                    ? "فتح Long"
                    : "فتح Short"}
              </button>
            </div>
          </section>

          {/* الأسواق / المراكز */}
          <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#07101d]">

            <div className="border-b border-white/10 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold">
                    {selectedSymbol ||
                      "العقود الآجلة"}
                  </h2>

                  <p className="mt-1 text-[10px] text-slate-600">
                    بيانات السعر من خدمة السوق الحالية.
                  </p>
                </div>

                {selectedCoin ? (
                  <div className="text-left">
                    <div className="text-[10px] text-slate-600">
                      السعر الحالي
                    </div>
                    <div className="mt-1 font-mono text-lg font-bold text-cyan-300">
                      {formatNumber(
                        selectedCoin.current_price,
                        8
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-b border-white/10">
              <div className="flex items-center gap-6 px-5 py-4 text-xs">
                <span className="border-b-2 border-cyan-400 pb-3 font-semibold text-cyan-300">
                  المراكز
                </span>
                <span className="text-slate-500">
                  الأوامر
                </span>
                <span className="text-slate-500">
                  التمويل
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">

              {openPositions.length === 0 ? (
                <div className="px-5 py-16 text-center">
                  <BarChart3
                    size={25}
                    className="mx-auto text-slate-600"
                  />
                  <div className="mt-4 text-xs font-semibold text-slate-400">
                    لا توجد مراكز مفتوحة
                  </div>
                  <div className="mt-2 text-[10px] text-slate-600">
                    ستظهر المراكز التي تفتحها من النموذج هنا.
                  </div>
                </div>
              ) : (
                <table className="min-w-[1050px] w-full text-right">
                  <thead className="border-b border-white/10">
                    <tr className="text-[10px] text-slate-600">
                      <th className="px-5 py-4">العقد</th>
                      <th className="px-5 py-4">الاتجاه</th>
                      <th className="px-5 py-4">الكمية</th>
                      <th className="px-5 py-4">الدخول</th>
                      <th className="px-5 py-4">السعر الحالي</th>
                      <th className="px-5 py-4">الرافعة</th>
                      <th className="px-5 py-4">PnL</th>
                      <th className="px-5 py-4">التصفية</th>
                      <th className="px-5 py-4">إجراء</th>
                    </tr>
                  </thead>

                  <tbody>
                    {openPositions.map(
                      (position) => {
                        const id =
                          String(
                            position._id || ""
                          );

                        const pnl =
                          number(
                            position.pnl
                          );

                        return (
                          <tr
                            key={id}
                            className="border-b border-white/[0.05]"
                          >
                            <td className="px-5 py-4 font-semibold text-white">
                              {String(
                                position.symbol ||
                                  "—"
                              )}
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={
                                  String(
                                    position.side
                                  ).toLowerCase() ===
                                  "long"
                                    ? "text-emerald-300"
                                    : "text-red-300"
                                }
                              >
                                {String(
                                  position.side
                                ).toLowerCase() ===
                                "long"
                                  ? "Long"
                                  : "Short"}
                              </span>
                            </td>

                            <td className="px-5 py-4 font-mono text-xs text-slate-300">
                              {formatNumber(
                                position.quantity,
                                8
                              )}
                            </td>

                            <td className="px-5 py-4 font-mono text-xs text-slate-300">
                              {formatNumber(
                                position.entryPrice,
                                8
                              )}
                            </td>

                            <td className="px-5 py-4 font-mono text-xs text-slate-300">
                              {formatNumber(
                                position.markPrice,
                                8
                              )}
                            </td>

                            <td className="px-5 py-4 font-mono text-xs text-slate-300">
                              {formatNumber(
                                position.leverage,
                                2
                              )}x
                            </td>

                            <td
                              className={`px-5 py-4 font-mono text-xs ${
                                pnl > 0
                                  ? "text-emerald-300"
                                  : pnl < 0
                                    ? "text-red-300"
                                    : "text-slate-400"
                              }`}
                            >
                              {pnl > 0
                                ? "+"
                                : ""}
                              {formatNumber(
                                pnl,
                                8
                              )}
                            </td>

                            <td className="px-5 py-4 font-mono text-xs text-slate-400">
                              {formatNumber(
                                position.liquidationPrice,
                                8
                              )}
                            </td>

                            <td className="px-5 py-4">
                              <button
                                type="button"
                                onClick={() =>
                                  void closePosition(
                                    position
                                  )
                                }
                                disabled={
                                  closingId ===
                                  id
                                }
                                className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[10px] font-bold text-red-300 hover:bg-red-500/[0.12] disabled:opacity-50"
                              >
                                {closingId ===
                                id
                                  ? "جارٍ..."
                                  : "إغلاق"}
                              </button>
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              )}

              {openOrders.length > 0 ? (
                <div className="border-t border-white/10">
                  <div className="border-b border-white/10 p-5 text-sm font-bold">
                    الأوامر المفتوحة
                  </div>

                  <table className="min-w-[900px] w-full text-right">
                    <thead className="border-b border-white/10">
                      <tr className="text-[10px] text-slate-600">
                        <th className="px-5 py-4">العقد</th>
                        <th className="px-5 py-4">الاتجاه</th>
                        <th className="px-5 py-4">النوع</th>
                        <th className="px-5 py-4">الكمية</th>
                        <th className="px-5 py-4">السعر</th>
                        <th className="px-5 py-4">الرافعة</th>
                        <th className="px-5 py-4">الحالة</th>
                        <th className="px-5 py-4">إجراء</th>
                      </tr>
                    </thead>

                    <tbody>
                      {openOrders.map(
                        (order) => {
                          const id =
                            String(
                              order._id ||
                                ""
                            );

                          return (
                            <tr
                              key={id}
                              className="border-b border-white/[0.05]"
                            >
                              <td className="px-5 py-4 text-xs font-semibold text-white">
                                {order.symbol ||
                                  "—"}
                              </td>

                              <td className="px-5 py-4 text-xs">
                                {order.side ===
                                "long" ? (
                                  <span className="text-emerald-300">
                                    Long
                                  </span>
                                ) : (
                                  <span className="text-red-300">
                                    Short
                                  </span>
                                )}
                              </td>

                              <td className="px-5 py-4 text-xs text-slate-400">
                                {order.type ||
                                  "—"}
                              </td>

                              <td className="px-5 py-4 font-mono text-xs text-slate-300">
                                {formatNumber(
                                  order.quantity,
                                  8
                                )}
                              </td>

                              <td className="px-5 py-4 font-mono text-xs text-slate-300">
                                {formatNumber(
                                  order.price,
                                  8
                                )}
                              </td>

                              <td className="px-5 py-4 font-mono text-xs text-slate-300">
                                {formatNumber(
                                  order.leverage,
                                  2
                                )}x
                              </td>

                              <td className="px-5 py-4 text-xs text-amber-300">
                                {statusLabel(
                                  order.status
                                )}
                              </td>

                              <td className="px-5 py-4">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void cancelOrder(
                                      order
                                    )
                                  }
                                  disabled={
                                    cancellingId ===
                                    id
                                  }
                                  className="rounded-lg border border-red-500/20 px-3 py-2 text-[10px] text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                                >
                                  {cancellingId ===
                                  id
                                    ? "جارٍ..."
                                    : "إلغاء"}
                                </button>
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {latestFunding.length > 0 ? (
                <div className="border-t border-white/10">
                  <div className="border-b border-white/10 p-5 text-sm font-bold">
                    سجل التمويل
                  </div>

                  <table className="min-w-[800px] w-full text-right">
                    <thead className="border-b border-white/10">
                      <tr className="text-[10px] text-slate-600">
                        <th className="px-5 py-4">العقد</th>
                        <th className="px-5 py-4">القيمة</th>
                        <th className="px-5 py-4">معدل التمويل</th>
                        <th className="px-5 py-4">المبلغ</th>
                        <th className="px-5 py-4">الحالة</th>
                        <th className="px-5 py-4">التاريخ</th>
                      </tr>
                    </thead>

                    <tbody>
                      {latestFunding.map(
                        (payment) => (
                          <tr
                            key={String(
                              payment._id ||
                                payment.createdAt
                            )}
                            className="border-b border-white/[0.05]"
                          >
                            <td className="px-5 py-4 text-xs font-semibold">
                              {payment.symbol ||
                                "—"}
                            </td>

                            <td className="px-5 py-4 font-mono text-xs text-slate-300">
                              {formatNumber(
                                payment.notional,
                                8
                              )}
                            </td>

                            <td className="px-5 py-4 font-mono text-xs text-slate-300">
                              {formatNumber(
                                payment.fundingRate,
                                8
                              )}
                            </td>

                            <td className="px-5 py-4 font-mono text-xs text-slate-300">
                              {formatNumber(
                                payment.amount,
                                8
                              )}
                            </td>

                            <td className="px-5 py-4 text-xs text-slate-400">
                              {statusLabel(
                                payment.status
                              )}
                            </td>

                            <td className="px-5 py-4 text-[10px] text-slate-500">
                              {formatDate(
                                payment.createdAt
                              )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}