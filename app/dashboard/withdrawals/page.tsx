"use client";

import { useCallback, useEffect, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { AlertCircle, CheckCircle2, CircleDollarSign, Layers3, RefreshCw, Wallet } from "lucide-react";

type Account = {
  _id: string;
  sourceAccountIds: string[];
  status: string;
  balance: number;
  locked: number;
  activationAmount: number;
  allowance: number;
  baseAllowance: number;
  dailyAllowance: number;
  activeReferralCount: number;
  referralDepositTotal: number;
  referralUnlockPercent: number;
  referralUsed: number;
  referralAllowance: number;
  available: number;
  hasAccount: boolean;
};
type Plan = {
  _id: string;
  name: string;
  price: number;
  minimum: number;
  enabled: boolean;
  account: Account | null;
};
type Network = { code: string; name: string };
type Request = {
  _id: string;
  type: string;
  packageId?: string | null;
  amount: number;
  grossAmount?: number;
  feePercent?: number;
  feeAmount?: number;
  payoutAmount?: number;
  conversionAsset?: string | null;
  conversionOrderId?: string | null;
  conversionQuantity?: number | null;
  conversionPrice?: number | null;
  tradingFeeAmount?: number;
  asset?: string;
  network?: string;
  payoutAddress?: string;
  status: string;
  createdAt?: string;
  reviewedAt?: string | null;
};
type SpotBalance = { asset: string; available: number; priceUsd?: number; valueUsd?: number };
type PendingConversionOrder = { orderId: string; asset: string; quantity: number };
type ConversionQuote = {
  success: boolean;
  message?: string;
  asset?: string;
  quantity?: number;
  available?: number;
  priceUsdt?: number;
  marketValueUsdt?: number;
  tradingFeePercent?: number;
  estimatedTradingFeeUsdt?: number;
  estimatedAfterTradingFeeUsdt?: number;
  withdrawalFeePercent?: number;
  estimatedWithdrawalFeeUsdt?: number;
  estimatedPayoutUsdt?: number;
  disclaimer?: string;
  externalExecutionConfigured?: boolean;
};
type Data = {
  summary: {
    totalBalance: number;
    generalAvailable: number;
    generalLocked: number;
    packageAvailable: number;
    packageLocked: number;
  };
  general: { available: number; minimum: number; configured: boolean; feePercent?: number };
  networks: Network[];
  packages: Plan[];
  requests: Request[];
};

const money = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 8 });

function isValidPayoutAddress(network: string, address: string) {
  if (network === "TRC20") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  if (network === "BEP20") return /^0x[a-fA-F0-9]{40}$/.test(address);
  return false;
}

export default function WithdrawalsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const [packageNetworks, setPackageNetworks] = useState<Record<string, string>>({});
  const [packageMessages, setPackageMessages] = useState<Record<string, string>>({});
  const [generalAmount, setGeneralAmount] = useState("");
  const [generalAddress, setGeneralAddress] = useState("");
  const [generalNetwork, setGeneralNetwork] = useState("");
  const [spotBalances, setSpotBalances] = useState<SpotBalance[]>([]);
  const [conversionAsset, setConversionAsset] = useState("USDT");
  const [conversionQuantity, setConversionQuantity] = useState("");
  const [conversionQuote, setConversionQuote] = useState<ConversionQuote | null>(null);
  const [conversionPendingOrder, setConversionPendingOrder] = useState<PendingConversionOrder | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error" | "info">("info");

  function showMessage(text: string, kind: "success" | "error" | "info" = "error") {
    setMessage(text);
    setMessageKind(kind);
  }

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [response, walletResponse, ordersResponse] = await Promise.all([
        fetch("/api/withdrawals", { credentials: "include", cache: "no-store" }),
        fetch("/api/wallet?mode=live", { credentials: "include", cache: "no-store" }),
        fetch("/api/orders?purpose=withdrawal-conversion&limit=30", { credentials: "include", cache: "no-store" }),
      ]);
      const [json, walletJson, ordersJson] = await Promise.all([
        response.json().catch(() => ({})),
        walletResponse.json().catch(() => ({})),
        ordersResponse.json().catch(() => ({})),
      ]);
      if (walletResponse.ok && walletJson.success) {
        const rows = (walletJson.wallet?.balances || walletJson.spot?.balances || [])
          .map((row: any) => ({
            asset: String(row.asset || "").toUpperCase(),
            available: Number(row.available || 0),
            priceUsd: Number(row.priceUsd || 0),
            valueUsd: Number(row.valueUsd || 0),
          }))
          .filter((row: SpotBalance) => row.asset && Number.isFinite(row.available) && row.available > 0);
        setSpotBalances(rows);
        setConversionAsset((current) => rows.some((row: SpotBalance) => row.asset === current)
          ? current
          : (rows.find((row: SpotBalance) => row.asset !== "USDT")?.asset || rows[0]?.asset || "USDT"));
      }
      if (!response.ok || !json.success) {
        showMessage(json.message || "تعذر تحميل بيانات السحب", "error");
        return;
      }
      setData(json as Data);
      setGeneralNetwork((current) => {
        if (current && json.networks?.some((network: Network) => network.code === current)) return current;
        return json.networks?.[0]?.code || "";
      });
      const usedConversionIds = new Set<string>(
        (json.requests || []).map((item: Request) => String(item.conversionOrderId || "")).filter(Boolean),
      );
      const recoverable = (ordersJson?.orders || []).find((order: any) => {
        const orderId = String(order._id || "");
        return orderId &&
          !usedConversionIds.has(orderId) &&
          order.purpose === "withdrawal-conversion" &&
          order.executionProvider === "binance" &&
          order.withdrawalConversionStatus === "pending" &&
          order.side === "sell" &&
          /USDT$/.test(String(order.symbol || "")) &&
          ["open", "filled", "cancelled", "rejected"].includes(String(order.status || "").toLowerCase());
      });
      setConversionPendingOrder((current) => {
        if (current && usedConversionIds.has(current.orderId)) return null;
        if (current && !usedConversionIds.has(current.orderId)) return current;
        if (!recoverable) return null;
        const orderId = String(recoverable._id);
        const symbol = String(recoverable.symbol || "").toUpperCase();
        const asset = symbol.endsWith("USDT") ? symbol.slice(0, -4) : "";
        const quantity = Number(recoverable.originalQuantity || recoverable.settledExecutedQuantity || 0);
        if (!asset || !Number.isFinite(quantity) || quantity <= 0) return null;
        setConversionAsset(asset);
        setConversionQuantity(String(quantity));
        return { orderId, asset, quantity };
      });
    } catch {
      showMessage("تعذر تحميل بيانات السحب", "error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const quantity = Number(conversionQuantity);
    if (conversionPendingOrder) {
      setConversionQuote(null);
      setQuoteLoading(false);
      return;
    }
    if (!conversionAsset || !Number.isFinite(quantity) || quantity <= 0 || Math.round(quantity * 1e8) / 1e8 !== quantity) {
      setConversionQuote(null);
      setQuoteLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const params = new URLSearchParams({ asset: conversionAsset, quantity: String(quantity) });
        const response = await fetch("/api/withdrawals/quote?" + params.toString(), {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!controller.signal.aborted) {
          setConversionQuote(result as ConversionQuote);
        }
      } catch {
        if (!controller.signal.aborted) {
          setConversionQuote({ success: false, message: "تعذر تحديث تقدير السعر الحالي." });
        }
      } finally {
        if (!controller.signal.aborted) setQuoteLoading(false);
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [conversionAsset, conversionQuantity, conversionPendingOrder]);

  const hasPending = Boolean(data?.requests.some((item) => item.status === "pending"));
  const selectedSpotBalance = spotBalances.find((row) => row.asset === conversionAsset);
  const firstNetwork = data?.networks[0]?.code || "";
  const selectedGeneralNetwork = generalNetwork || firstNetwork;

  async function submit(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    setMessageKind("info");
    try {
      const response = await fetch("/api/withdrawals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        showMessage(result.message || "تعذر إنشاء طلب السحب", "error");
      } else {
        showMessage(result.message || "تم إرسال طلب السحب بنجاح", "success");
      }
      await load();
    } catch {
      showMessage("تعذر الاتصال بخدمة السحب", "error");
    } finally {
      setBusy(false);
    }
  }

  function submitGeneral() {
    const amount = Number(generalAmount);
    if (!generalAddress.trim()) {
      showMessage("اكتب عنوان الدفع");
      return;
    }
    if (!selectedGeneralNetwork) {
      showMessage("اختر شبكة السحب");
      return;
    }
    if (!data?.general.configured) {
      showMessage("الأدمن لم يحدد الحد الأدنى للسحب العام بعد");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showMessage("اكتب مبلغ سحب صحيحًا");
      return;
    }
    if (amount < data.general.minimum) {
      showMessage("الحد الأدنى للسحب العام هو " + money(data.general.minimum) + " USDT");
      return;
    }
    if (amount > data.general.available) {
      showMessage("الرصيد العام المتاح للسحب هو " + money(data.general.available) + " USDT فقط");
      return;
    }
    if (!isValidPayoutAddress(selectedGeneralNetwork, generalAddress.trim())) {
      showMessage(selectedGeneralNetwork === "TRC20"
        ? "عنوان TRC20 يجب أن يكون عنوان TRON بطول 34 حرفًا يبدأ بـ T."
        : "عنوان BEP20 يجب أن يبدأ بـ 0x ويتبعه 40 رقمًا سداسيًا.");
      return;
    }
    void submit({
      type: "general",
      amount,
      asset: "USDT",
      network: selectedGeneralNetwork,
      payoutAddress: generalAddress.trim(),
    });
  }

  async function submitConvertedGeneral() {
    const pending = conversionPendingOrder;
    const assetToSell = pending?.asset || conversionAsset;
    const quantity = pending?.quantity ?? Number(conversionQuantity);
    const address = generalAddress.trim();

    if (!data?.general.configured) {
      showMessage("الأدمن لم يحدد الحد الأدنى للسحب العام بعد");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || Math.round(quantity * 1e8) / 1e8 !== quantity) {
      showMessage("اختر عملة من رصيد التداول واكتب كمية صحيحة بحد أقصى 8 منازل عشرية");
      return;
    }
    if (!pending) {
      if (!selectedSpotBalance) {
        showMessage("اختر عملة موجودة في رصيد التداول");
        return;
      }
      if (quantity > selectedSpotBalance.available + 1e-8) {
        showMessage("الكمية أكبر من الرصيد المتاح من " + assetToSell);
        return;
      }
    }
    if (!address) {
      showMessage("اكتب عنوان الدفع قبل تنفيذ التحويل والسحب");
      return;
    }
    if (!selectedGeneralNetwork) {
      showMessage("اختر شبكة السحب");
      return;
    }
    if (!isValidPayoutAddress(selectedGeneralNetwork, address)) {
      showMessage(selectedGeneralNetwork === "TRC20"
        ? "عنوان TRC20 يجب أن يكون عنوان TRON بطول 34 حرفًا يبدأ بـ T."
        : "عنوان BEP20 يجب أن يبدأ بـ 0x ويتبعه 40 رقمًا سداسيًا.");
      return;
    }
    if (!pending && !conversionQuote?.success) {
      showMessage("انتظر تحديث سعر السوق واحصل على تقدير صالح قبل المتابعة");
      return;
    }

    if (!pending && assetToSell === "USDT") {
      if (quantity < data.general.minimum) {
        showMessage("الحد الأدنى للسحب العام هو " + money(data.general.minimum) + " USDT");
        return;
      }
      if (quantity > data.general.available) {
        showMessage("الرصيد العام المتاح للسحب هو " + money(data.general.available) + " USDT فقط");
        return;
      }
      void submit({
        type: "general",
        amount: quantity,
        asset: "USDT",
        network: selectedGeneralNetwork,
        payoutAddress: address,
      });
      return;
    }

    if (!pending && !conversionQuote?.externalExecutionConfigured) {
      showMessage("البيع التلقائي غير مفعّل: يلزم إعداد اتصال Binance API على الخادم. لم تُبع أي عملة.");
      return;
    }
    if (!pending && Number(conversionQuote?.estimatedAfterTradingFeeUsdt || 0) < data.general.minimum) {
      showMessage("صافي حصيلة البيع المتوقع أقل من الحد الأدنى للسحب العام " + money(data.general.minimum) + " USDT. زِد الكمية قبل التنفيذ.");
      return;
    }

    setBusy(true);
    setMessage("");
    setMessageKind("info");
    try {
      const orderResponse = pending
        ? await fetch("/api/orders/match", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: pending.orderId, mode: "live" }),
          })
        : await fetch("/api/orders", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify({
              symbol: assetToSell + "USDT",
              side: "sell",
              type: "market",
              quantity,
              purpose: "withdrawal-conversion",
            }),
          });
      const orderResult = await orderResponse.json().catch(() => ({}));
      if (!orderResponse.ok || !orderResult.success) {
        showMessage(orderResult.message || "تعذر تنفيذ أو تحديث أمر البيع لدى Binance. لم يتم إنشاء طلب سحب.", "error");
        await load();
        return;
      }
      if (orderResult.executionProvider !== "binance") {
        showMessage("لم يؤكد النظام أن البيع نُفّذ لدى Binance؛ لم يتم إنشاء طلب السحب.", "error");
        await load();
        return;
      }

      const actualOrder = orderResult.order || {};
      const conversionOrderId = String(actualOrder._id || pending?.orderId || "").trim();
      const orderStatus = String(actualOrder.status || "").toLowerCase();
      if (!conversionOrderId) {
        showMessage("لم يصل مرجع أمر البيع من Binance. لم يتم إنشاء طلب سحب؛ تحقق من سجل الأوامر قبل أي محاولة جديدة.", "error");
        await load();
        return;
      }
      if (!["filled", "cancelled", "rejected"].includes(orderStatus)) {
        setConversionPendingOrder({ orderId: conversionOrderId, asset: assetToSell, quantity });
        showMessage(String(orderResult.message || "أمر البيع ما زال مفتوحًا لدى Binance.") + " لن نرسل أمر بيع جديدًا لنفس الكمية. اضغط متابعة التحويل لتحديث الأمر الحالي.", "info");
        await load();
        return;
      }

      const settledGross = Math.max(0, Number(actualOrder.settledQuoteQuantity || 0));
      const settledTradingFee = Math.max(0, Number(actualOrder.settledFeeAmount || 0));
      const fillRows = Array.isArray(orderResult.matching?.trades) ? orderResult.matching.trades : [];
      const fallbackProceeds = fillRows.reduce((sum: number, trade: any) => {
        return sum + Math.max(0, (Number(trade.quoteAmount) || 0) - (Number(trade.feeAmount) || 0));
      }, 0);
      const settledProceeds = Math.max(0, settledGross - settledTradingFee);
      const convertedUsdt = Math.round((settledProceeds > 0 ? settledProceeds : fallbackProceeds) * 1e8) / 1e8;

      if (convertedUsdt <= 0) {
        try {
          await fetch("/api/withdrawals/conversion-status", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: conversionOrderId, action: "dismiss-empty" }),
          });
        } catch {}
        setConversionPendingOrder(null);
        setConversionQuantity("");
        showMessage("انتهى أمر البيع دون حصيلة منفذة؛ لن يُنشأ طلب سحب ولن نكرر أمر البيع.", "info");
        await load();
        return;
      }
      if (convertedUsdt < data.general.minimum) {
        const resolved = await fetch("/api/withdrawals/conversion-status", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: conversionOrderId, action: "below-minimum" }),
        });
        const resolvedJson = await resolved.json().catch(() => ({}));
        if (!resolved.ok || !resolvedJson.success) {
          setConversionPendingOrder({ orderId: conversionOrderId, asset: assetToSell, quantity });
          showMessage(resolvedJson.message || "تم البيع لكن تعذر إغلاق متابعة التحويل. لا ترسل أمر بيع آخر.", "error");
          await load();
          return;
        }
        setConversionPendingOrder(null);
        setConversionQuantity("");
        showMessage("تم بيع " + assetToSell + " لدى Binance فعليًا، لكن صافي حصيلة البيع " + money(convertedUsdt) + " USDT أقل من الحد الأدنى للسحب. بقيت الحصيلة في محفظة USDT؛ يمكنك سحبها مع بقية رصيد USDT عند بلوغ الحد الأدنى.", "info");
        await load();
        return;
      }

      const withdrawalResponse = await fetch("/api/withdrawals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "general",
          amount: convertedUsdt,
          conversionOrderId,
          asset: "USDT",
          network: selectedGeneralNetwork,
          payoutAddress: address,
        }),
      });
      const withdrawalResult = await withdrawalResponse.json().catch(() => ({}));
      if (!withdrawalResponse.ok || !withdrawalResult.success) {
        showMessage("تم تأكيد بيع العملة وتحويل صافي " + money(convertedUsdt) + " USDT إلى رصيدك، لكن لم يُنشأ طلب السحب. الرصيد ما زال في محفظة التداول. السبب: " + String(withdrawalResult.message || "تعذر إنشاء الطلب") + " يمكنك متابعة نفس أمر البيع دون إرسال بيع جديد.", "error");
        setConversionPendingOrder({ orderId: conversionOrderId, asset: assetToSell, quantity });
        await load();
        return;
      }

      const fee = Math.round(convertedUsdt * 0.05 * 1e8) / 1e8;
      const payout = Math.round((convertedUsdt - fee) * 1e8) / 1e8;
      showMessage("تم تأكيد بيع " + assetToSell + " لدى Binance، وإنشاء طلب سحب بقيمة " + money(convertedUsdt) + " USDT. عمولة السحب " + money(fee) + " USDT، والصافي المطلوب إرساله " + money(payout) + " USDT.", "success");
      setConversionPendingOrder(null);
      setConversionQuantity("");
      await load();
    } catch {
      showMessage("تعذر تأكيد النتيجة النهائية. لا ترسل أمر بيع جديدًا؛ افتح سجل التداول والمحفظة أو تابع أمر التحويل الحالي.", "error");
      await load();
    } finally {
      setBusy(false);
    }
  }

  function handlePackageButtonClick(plan: Plan, needsActiveReferrals: boolean) {
    if (needsActiveReferrals) {
      setPackageMessages((current) => ({ ...current, [plan._id]: "لا توجد إحالات نشطة" }));
      return;
    }
    setPackageMessages((current) => ({ ...current, [plan._id]: "" }));
    submitPackage(plan);
  }

  function submitPackage(plan: Plan) {
    const account = plan.account;
    const address = (addresses[plan._id] || "").trim();
    const amount = Number(amounts[plan._id]);
    const network = packageNetworks[plan._id] || firstNetwork;

    if (!account?.hasAccount) {
      showMessage("لا يوجد حساب سحب لهذه الباقة قبل تفعيلها");
      return;
    }
    if (!address) {
      showMessage("اكتب عنوان الدفع لهذه الباقة");
      return;
    }
    if (!network) {
      showMessage("اختر شبكة السحب");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount < plan.minimum) {
      showMessage("الحد الأدنى للسحب هو " + plan.minimum + " USDT");
      return;
    }
    if (amount > Number(account.available || 0)) {
      showMessage("المتاح للسحب من هذه الباقة هو " + money(Number(account.available || 0)) + " USDT فقط");
      return;
    }
    if (Math.round(amount * 1e8) / 1e8 !== amount) {
      showMessage("مبلغ السحب يجب ألا يتجاوز 8 منازل عشرية");
      return;
    }
    if (!isValidPayoutAddress(network, address)) {
      showMessage(network === "TRC20"
        ? "عنوان TRC20 يجب أن يكون عنوان TRON بطول 34 حرفًا يبدأ بـ T."
        : "عنوان BEP20 يجب أن يبدأ بـ 0x ويتبعه 40 رقمًا سداسيًا.");
      return;
    }
    void submit({
      type: "package",
      packageId: plan._id,
      amount,
      asset: "USDT",
      network,
      payoutAddress: address,
    });
  }

  const visiblePackages = data?.packages || [];

  return (
    <>
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />
        <main dir="rtl" className="min-h-screen min-w-0 flex-1 space-y-6 bg-[#050a13] p-4 text-white md:p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black">السحب</h1>
              <p className="mt-1 text-xs text-slate-500">بيانات الطلبات والأرصدة تتحدث تلقائيًا.</p>
            </div>
            <button type="button" onClick={() => void load()} disabled={refreshing || busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              تحديث
            </button>
          </header>

          {message && (
            <div role={messageKind === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
              messageKind === "success"
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200"
                : messageKind === "error"
                  ? "border-red-500/20 bg-red-500/5 text-red-200"
                  : "border-amber-400/20 bg-amber-400/[0.04] text-amber-100"
            }`}>
              {messageKind === "error"
                ? <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-300" />
                : <CheckCircle2 size={18} className={`mt-0.5 shrink-0 ${messageKind === "success" ? "text-emerald-300" : "text-amber-200"}`} />}
              <span>{message}</span>
            </div>
          )}
          {hasPending && (
            <div role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3 text-sm text-amber-100">
              لديك طلب سحب قيد المراجعة. لن يمكن إرسال طلب آخر حتى يراجع الأدمن الطلب الحالي.
            </div>
          )}

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Layers3 size={20} className="text-cyan-300" />
              <h2 className="text-xl font-black">السحب من الباقات</h2>
            </div>
            <p className="text-sm text-slate-400">ملاحظة: إذا كان الرصيد المتاح 0، يُرجى جلب إحالات نشطة للتمكن من السحب.</p>

            {!data && <p className="text-sm text-slate-400">جاري تحميل الباقات…</p>}
            {data && visiblePackages.length === 0 && <p className="rounded-xl border border-slate-700 p-4 text-slate-400">لا توجد باقات لديك أرصدة سحب منها حاليًا.</p>}

            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {visiblePackages.map((plan) => {
                const account = plan.account;
                const network = packageNetworks[plan._id] || firstNetwork;
                const canWithdraw = Boolean(account?.hasAccount && account.available > 0);
                const needsActiveReferrals = Boolean(
                  account?.hasAccount &&
                  account.balance >= plan.minimum &&
                  account.baseAllowance <= 0 &&
                  account.referralAllowance <= 0
                );
                return (
                  <article key={plan._id} className="flex flex-col gap-4 rounded-2xl border border-slate-700 bg-[#08111e] p-4 md:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-black">{plan.name}</h3>
                      </div>
                      <div className="shrink-0 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-left">
                        <p className="text-xs text-slate-400">إجمالي رصيد الباقة</p>
                        <p className="mt-1 font-black text-white">{money(account?.balance || 0)} USDT</p>
                        <p className="mt-2 text-xs text-slate-400">المتاح للسحب الآن</p>
                        <p className="mt-1 font-black text-emerald-300">{money(account?.available || 0)} USDT</p>
                        {Number(account?.locked || 0) > 0 && <p className="mt-2 text-xs text-amber-200">محجوز: {money(account?.locked || 0)} USDT</p>}
                      </div>
                    </div>

                    <label className="block space-y-2 text-sm text-slate-300">
                      <span>عنوان الدفع</span>
                      <input type="text" autoComplete="off" maxLength={200} disabled={busy || hasPending} value={addresses[plan._id] || ""} onChange={(event) => setAddresses((current) => ({ ...current, [plan._id]: event.target.value }))} placeholder={network === "TRC20" ? "عنوان TRON يبدأ بـ T وطوله 34 حرفًا" : "عنوان BEP20 يبدأ بـ 0x وطوله 42 حرفًا"} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50" />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-2 text-sm text-slate-300">
                        <span>العملة</span>
                        <select value="USDT" disabled className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white disabled:opacity-100">
                          <option value="USDT">USDT</option>
                        </select>
                      </label>
                      <label className="block space-y-2 text-sm text-slate-300">
                        <span>الشبكة</span>
                        <select value={network} onChange={(event) => setPackageNetworks((current) => ({ ...current, [plan._id]: event.target.value }))} disabled={busy || hasPending || !data?.networks.length} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white disabled:cursor-not-allowed disabled:opacity-50">
                          {!data?.networks.length && <option value="">لا توجد شبكات</option>}
                          {data?.networks.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
                        </select>
                      </label>
                    </div>

                    <input aria-label={"مبلغ السحب من " + plan.name} type="number" min={plan.minimum} max={account?.available} step="0.00000001" disabled={busy || hasPending || !canWithdraw} value={amounts[plan._id] || ""} onChange={(event) => setAmounts((current) => ({ ...current, [plan._id]: event.target.value }))} placeholder={"الحد الأدنى " + money(plan.minimum) + " USDT قبل العمولة"} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50" />
                    <div className="rounded-lg border border-slate-700 bg-[#050a13] p-3 text-xs">
                      <div className="flex justify-between gap-2 text-slate-400"><span>عمولة السحب (5%)</span><span className="text-amber-200">{money(Math.round(Math.max(0, Number(amounts[plan._id]) || 0) * 0.05 * 1e8) / 1e8)} USDT</span></div>
                      <div className="mt-2 flex justify-between gap-2"><span className="text-slate-300">صافي المبلغ المرسل</span><strong className="text-emerald-300">{money(Math.max(0, Number(amounts[plan._id]) || 0) - Math.round(Math.max(0, Number(amounts[plan._id]) || 0) * 0.05 * 1e8) / 1e8)} USDT</strong></div>
                    </div>

                    <div className="mt-auto space-y-2">
                      <button type="button" disabled={busy || hasPending || (!needsActiveReferrals && (!canWithdraw || !addresses[plan._id]?.trim() || !network))} onClick={() => handlePackageButtonClick(plan, needsActiveReferrals)} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
                        دفع
                      </button>
                      {packageMessages[plan._id] && <p role="status" className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-sm text-amber-200">{packageMessages[plan._id]}</p>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-cyan-500/20 bg-[#08111e] p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Wallet size={20} className="text-cyan-300" />
                <h2 className="text-xl font-black">السحب العام</h2>
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-4 py-2">
                <span className="text-xs text-slate-300">الرصيد المتاح عبر {selectedGeneralNetwork || "الشبكة المحددة"}</span>
                <strong className="mt-1 block text-lg font-black text-emerald-300">{data ? money(data.general.available) : "—"} USDT</strong>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_1.35fr_1fr]">
              <label className="block space-y-2 text-sm text-slate-300">
                <span>مبلغ السحب (USDT)</span>
                <input type="number" min={data?.general.minimum || undefined} max={data?.general.available} step="0.00000001" value={generalAmount} disabled={busy || hasPending || !data?.general.configured} onChange={(event) => setGeneralAmount(event.target.value)} placeholder={data?.general.configured ? "الحد الأدنى " + money(data.general.minimum) : "الحد الأدنى يحدده الأدمن"} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50" />
              </label>

              <label className="block space-y-2 text-sm text-slate-300">
                <span>عنوان السحب</span>
                <input value={generalAddress} maxLength={200} disabled={busy || hasPending} onChange={(event) => setGeneralAddress(event.target.value)} placeholder={selectedGeneralNetwork === "TRC20" ? "عنوان TRC20 يبدأ بـ T وطوله 34 حرفًا" : "عنوان BEP20 يبدأ بـ 0x وطوله 42 حرفًا"} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50" />
              </label>

              <label className="block space-y-2 text-sm text-slate-300">
                <span>شبكة السحب</span>
                <select value={selectedGeneralNetwork} onChange={(event) => setGeneralNetwork(event.target.value)} disabled={busy || hasPending || !data?.networks.length} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {!data?.networks.length && <option value="">لا توجد شبكات</option>}
                  {data?.networks.map((network) => <option key={network.code} value={network.code}>{network.name} ({network.code})</option>)}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#050a13] p-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="text-slate-400">العمولة ({data?.general.feePercent ?? 5}%): <strong className="text-amber-200">{money(Math.round(Math.max(0, Number(generalAmount) || 0) * (Number(data?.general.feePercent ?? 5) / 100) * 1e8) / 1e8)} USDT</strong></span>
                <span className="text-slate-300">صافي المبلغ: <strong className="text-emerald-300">{money(Math.max(0, Number(generalAmount) || 0) - Math.round(Math.max(0, Number(generalAmount) || 0) * (Number(data?.general.feePercent ?? 5) / 100) * 1e8) / 1e8)} USDT</strong></span>
              </div>
              <button type="button" onClick={submitGeneral} disabled={busy || hasPending || !data?.general.configured || !selectedGeneralNetwork || !data?.networks.length} className="min-w-32 rounded-lg bg-blue-600 px-8 py-3 font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? "جارٍ السحب..." : "سحب"}
              </button>
            </div>

            <details className="rounded-xl border border-slate-700 bg-[#0b1422] p-3">
              <summary className="cursor-pointer select-none text-sm font-bold text-cyan-100">تحويل عملات التداول إلى USDT قبل السحب (اختياري)</summary>
              <p className="mt-2 text-xs leading-5 text-slate-400">لتحويل عملة أخرى من محفظة التداول، اختر العملة والكمية. سيتم عرض السعر والرسوم أولًا، ولا يُرسل أمر البيع إلا عند الضغط على زر التنفيذ أدناه.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2 text-sm text-slate-300">
                  <span>عملة التداول</span>
                  <select value={conversionAsset} onChange={(event) => { setConversionAsset(event.target.value); setConversionQuantity(""); setConversionQuote(null); }} disabled={busy || hasPending || Boolean(conversionPendingOrder) || !spotBalances.length} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white disabled:opacity-50">
                    {!spotBalances.length && <option value="">لا توجد أرصدة متاحة</option>}
                    {spotBalances.map((row) => <option key={row.asset} value={row.asset}>{row.asset} — متاح {money(row.available)}</option>)}
                  </select>
                </label>
                <label className="block space-y-2 text-sm text-slate-300">
                  <span>الكمية المراد تحويلها</span>
                  <input type="number" min="0.00000001" max={selectedSpotBalance?.available} step="0.00000001" value={conversionQuantity} disabled={busy || hasPending || Boolean(conversionPendingOrder) || !selectedSpotBalance} onChange={(event) => setConversionQuantity(event.target.value)} placeholder={selectedSpotBalance ? "الحد الأقصى " + money(selectedSpotBalance.available) + " " + conversionAsset : "اختر عملة أولًا"} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-500 disabled:opacity-50" />
                </label>
              </div>
              {quoteLoading && <p className="mt-3 text-xs text-cyan-200">جاري حساب القيمة بسعر السوق الحالي…</p>}
              {conversionQuote && (
                conversionQuote.success ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-slate-700 bg-[#050a13] p-3">
                    <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                      <div><p className="text-slate-400">سعر {conversionAsset}</p><p className="mt-1 font-bold">{money(conversionQuote.priceUsdt || 0)} USDT</p></div>
                      <div><p className="text-slate-400">القيمة السوقية التقديرية</p><p className="mt-1 font-bold">{money(conversionQuote.marketValueUsdt || 0)} USDT</p></div>
                      <div><p className="text-slate-400">عمولة التداول التقديرية ({conversionQuote.tradingFeePercent || 0}%)</p><p className="mt-1 font-bold text-amber-200">{money(conversionQuote.estimatedTradingFeeUsdt || 0)} USDT</p></div>
                      <div><p className="text-slate-400">بعد عمولة التداول</p><p className="mt-1 font-bold">{money(conversionQuote.estimatedAfterTradingFeeUsdt || 0)} USDT</p></div>
                      <div><p className="text-slate-400">عمولة السحب (5%)</p><p className="mt-1 font-bold text-amber-200">{money(conversionQuote.estimatedWithdrawalFeeUsdt || 0)} USDT</p></div>
                      <div><p className="text-slate-400">صافي السحب التقديري</p><p className="mt-1 text-lg font-black text-emerald-300">{money(conversionQuote.estimatedPayoutUsdt || 0)} USDT</p></div>
                    </div>
                    <p className="text-[11px] leading-5 text-slate-500">{conversionQuote.disclaimer || "السعر تقديري وقد يتغير قبل التنفيذ."}</p>
                  </div>
                ) : <p role="alert" className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-rose-200">{conversionQuote.message || "تعذر حساب القيمة"}</p>
              )}
              <button type="button" onClick={() => void submitConvertedGeneral()} disabled={busy || hasPending || (!conversionPendingOrder && (!conversionQuantity || !conversionQuote?.success)) || !selectedGeneralNetwork || !data?.general.configured} className="mt-3 w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 font-black text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? "جارٍ تنفيذ التحويل والسحب..." : conversionPendingOrder ? "متابعة أمر بيع " + conversionPendingOrder.asset + " وإنشاء السحب" : conversionAsset === "USDT" ? "سحب كمية USDT المحددة" : "بيع " + conversionAsset + " بسعر السوق ثم السحب"}
              </button>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">للعملات غير USDT: لا يُنشأ طلب السحب إلا بعد تأكيد تنفيذ البيع وقراءة الحصيلة. إذا تعذّر إنشاء الطلب بعد البيع، تظل حصيلة USDT في محفظتك.</p>
            </details>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-700 bg-[#08111e] p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black">طلبات السحب وتاريخها</h2>
              <span className="text-xs text-slate-400">طلبات السحب العام وكل الباقات</span>
            </div>
            {!data?.requests.length ? (
              <p className="rounded-xl border border-slate-700 p-4 text-sm text-slate-400">لا توجد طلبات سحب مسجلة حتى الآن.</p>
            ) : (
              <div className="space-y-3">
                {data.requests.map((item) => {
                  const plan = data.packages.find((candidate) => candidate._id === item.packageId);
                  const statusLabel = item.status === "approved"
                    ? "مقبول"
                    : item.status === "rejected"
                      ? "مرفوض"
                      : item.status === "pending"
                        ? "قيد المراجعة"
                        : item.status;
                  const createdDate = item.createdAt ? new Date(item.createdAt) : null;
                  const reviewedDate = item.reviewedAt ? new Date(item.reviewedAt) : null;
                  return (
                    <article key={item._id} className="rounded-xl border border-slate-700 bg-[#0b1422] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <strong>{item.type === "general" ? "السحب العام" : plan?.name || "السحب من الباقات"}</strong>
                        <strong className="font-mono">{money(item.amount)} {item.asset || "USDT"}</strong>
                        <span className={item.status === "approved" ? "text-emerald-300" : item.status === "rejected" ? "text-red-300" : "text-amber-200"}>الحالة: {statusLabel}</span>
                      </div>
                      {item.conversionAsset && (
                        <div className="mt-2 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-2 text-xs text-slate-300">
                          <p>مصدر الرصيد: بيع {money(item.conversionQuantity || 0)} {item.conversionAsset} بسعر متوسط {money(item.conversionPrice || 0)} USDT.</p>
                          <p className="mt-1">عمولة التداول: {money(item.tradingFeeAmount || 0)} USDT — مرجع الأمر: <span className="break-all font-mono">{item.conversionOrderId || "—"}</span></p>
                        </div>
                      )}
                      <div className="mt-2 rounded-lg bg-[#050a13] p-2 text-xs">
                        <div className="grid gap-1 text-slate-400 sm:grid-cols-3">
                          <p>الإجمالي المحجوز: {money(item.grossAmount ?? item.amount)} USDT</p>
                          <p>العمولة: {money(item.feeAmount ?? 0)} USDT</p>
                          <p className="text-emerald-300">الصافي المطلوب إرساله: {money(item.payoutAmount ?? item.amount)} USDT</p>
                        </div>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                        <p>الشبكة: {item.network || "—"}</p>
                        <p>عنوان الدفع: <span className="break-all">{item.payoutAddress || "—"}</span></p>
                        <p>تاريخ الطلب: {createdDate && Number.isFinite(createdDate.getTime()) ? createdDate.toLocaleString("ar-EG") : "—"}</p>
                        {reviewedDate && Number.isFinite(reviewedDate.getTime()) && <p>تاريخ المراجعة: {reviewedDate.toLocaleString("ar-EG")}</p>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

        </main>
      </div>
    </>
  );
}
