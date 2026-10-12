"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Method = {
  _id: string;
  name: string;
  asset: string;
  network: string;
  address: string;
  minDeposit: number;
  minWithdrawal: number;
  enabled: boolean;
  withdrawalEnabled?: boolean;
  maxWithdrawal?: number;
  withdrawalFee?: number;
  warning?: string;
};

type Balance = {
  asset: string;
  available: number;
  locked: number;
};

type SavedAddress = {
  _id: string;
  asset: string;
  network: string;
  address: string;
};

type PackageAccount = {
  _id: string;
  packageName: string;
  asset: string;
  status: "active" | "cancelled";
  availableEarnings: number;
  lockedEarnings: number;
  investedAmount: number;
  totalWithdrawn: number;
  firstWithdrawalStatus?: "available" | "pending" | "completed";
  activeReferralCount?: number;
  activeReferralDepositTotal?: number;
  firstPackageWithdrawalPercent?: number;
  referralPackageWithdrawalPercent?: number;
  referralWithdrawalCap?: number;
  referralAlreadyWithdrawn?: number;
  referralRemaining?: number;
  withdrawalLimit?: number;
};

export default function WithdrawPage() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [depositBalances, setDepositBalances] = useState<Balance[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [packageAccounts, setPackageAccounts] = useState<PackageAccount[]>([]);
  const [withdrawalSource, setWithdrawalSource] = useState<"wallet" | "package">("wallet");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<
    SavedAddress[]
  >([]);

  const [history, setHistory] = useState<any[]>([]);

  const [selectedId, setSelectedId] =
    useState("");
  const selectedIdRef = useRef("");

  const [address, setAddress] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [savingAddress, setSavingAddress] =
    useState(false);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const load = useCallback(async () => {
    try {
      const [
        methodsResponse,
        walletResponse,
        historyResponse,
        addressesResponse,
        packageResponse,
      ] = await Promise.all([
        fetch("/api/payment-options", {
          cache: "no-store",
        }),

        fetch("/api/wallet", {
          credentials: "include",
          cache: "no-store",
        }),

        fetch("/api/withdrawals", {
          credentials: "include",
          cache: "no-store",
        }),

        fetch("/api/withdrawal-addresses", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/packages", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      const methodsData =
        await methodsResponse.json();

      const walletData =
        await walletResponse.json();

      const historyData =
        await historyResponse.json();

      const addressesData =
        await addressesResponse.json();

      const packageData = await packageResponse.json().catch(() => ({}));

      if (
        !methodsResponse.ok ||
        !methodsData.success
      ) {
        throw new Error(
          methodsData.message ||
            "تعذر تحميل وسائل الدفع"
        );
      }

      if (
        !walletResponse.ok ||
        !walletData.success
      ) {
        throw new Error(
          walletData.message ||
            "تعذر تحميل المحفظة"
        );
      }

      if (
        !historyResponse.ok ||
        !historyData.success
      ) {
        throw new Error(
          historyData.message ||
            "تعذر تحميل سجل السحب"
        );
      }

      if (
        !addressesResponse.ok ||
        !addressesData.success
      ) {
        throw new Error(
          addressesData.message ||
            "تعذر تحميل العناوين المحفوظة"
        );
      }

      const rows: Method[] =
        Array.isArray(methodsData.methods)
          ? methodsData.methods.filter(
              (method: Method) =>
                method.enabled !== false &&
                method.withdrawalEnabled !== false
            )
          : [];

      setMethods(rows);

      setDepositBalances(
        Array.isArray(walletData.depositBalances) ? walletData.depositBalances : []
      );
      setBalances(
        walletData.spot?.balances || walletData.wallet?.balances || []
      );

      setHistory(
        Array.isArray(historyData.withdrawals)
          ? historyData.withdrawals
          : []
      );

      setSavedAddresses(
        Array.isArray(addressesData.addresses)
          ? addressesData.addresses
          : []
      );

      const packageRows: PackageAccount[] = Array.isArray(packageData.userPackages)
        ? packageData.userPackages.filter((item: PackageAccount) =>
            ["active", "cancelled"].includes(item.status) && item.asset === "USDT"
          )
        : [];
      setPackageAccounts(packageRows);
      setSelectedPackageId((current) =>
        current && packageRows.some((item) => item._id === current)
          ? current
          : packageRows.find((item) => Number(item.availableEarnings || 0) > 0)?._id || packageRows[0]?._id || ""
      );

      if (rows.length > 0) {
        const currentId = rows.some((item) => item._id === selectedIdRef.current) ? selectedIdRef.current : rows[0]._id;
        selectedIdRef.current = currentId;
        setSelectedId(currentId);
        const currentMethod = rows.find((item) => item._id === currentId);
        const loadedAddresses: SavedAddress[] = Array.isArray(addressesData.addresses) ? addressesData.addresses : [];
        const knownAddress = loadedAddresses.find(
          (item) => item.asset === currentMethod?.asset && item.network === currentMethod?.network
        );
        setAddress(knownAddress?.address || "");
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "حدث خطأ أثناء تحميل بيانات السحب"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => { void load(); });
  }, [load]);

  const selected = useMemo(
    () =>
      methods.find(
        (method) =>
          method._id === selectedId
      ) || null,
    [methods, selectedId]
  );

  const selectedPackage = packageAccounts.find((item) => item._id === selectedPackageId);
  const packageFirstStatus = selectedPackage?.firstWithdrawalStatus === "pending" ? "pending" : Number(selectedPackage?.totalWithdrawn || 0) > 0 ? "completed" : (selectedPackage?.firstWithdrawalStatus || "available");
  const packageFirstWithdrawalPending = withdrawalSource === "package" && packageFirstStatus === "pending";
  const packageFirstWithdrawal = withdrawalSource === "package" && packageFirstStatus === "available";
  const packageWithdrawalMax = selectedPackage ? Math.max(0, Number(selectedPackage.withdrawalLimit ?? (packageFirstWithdrawal ? Math.min(Number(selectedPackage.availableEarnings || 0), Number(selectedPackage.investedAmount || 0)) : Number(selectedPackage.availableEarnings || 0)))) : 0;
  const selectedBalance =
    withdrawalSource === "package"
      ? Number(selectedPackage?.availableEarnings || 0)
      : balances.find((balance) => balance.asset === selected?.asset)?.available || 0;

  const savedAddress = selected
    ? savedAddresses.find(
        (item) =>
          item.asset === selected.asset &&
          item.network === selected.network
      )
    : undefined;

  function selectMethod(id: string) {
    selectedIdRef.current = id;
    setSelectedId(id);
    const method = methods.find((item) => item._id === id);
    const knownAddress = method && savedAddresses.find(
      (item) => item.asset === method.asset && item.network === method.network
    );
    setAddress(knownAddress?.address || "");
    setAmount("");
    setError("");
    setMessage("");
  }

  const amountNumber =
    Number(amount) || 0;

  const fee =
    Number(selected?.withdrawalFee || 0);

  const receive =
    Math.max(
      0,
      amountNumber - fee
    );

  async function saveCurrentAddress() {
    if (!selected) {
      setError("اختر وسيلة السحب أولًا");
      return;
    }

    const cleanAddress =
      address.trim();

    if (!cleanAddress) {
      setError("أدخل عنوان السحب");
      return;
    }

    setSavingAddress(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch(
        "/api/withdrawal-addresses",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            asset: selected.asset,
            network: selected.network,
            address: cleanAddress,
          }),
        }
      );

      const data =
        await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.message ||
            "تعذر حفظ العنوان"
        );
      }

      setMessage(
        "تم حفظ عنوان السحب."
      );

      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "تعذر حفظ العنوان"
      );
    } finally {
      setSavingAddress(false);
    }
  }

  async function submit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      if (!selected) {
        throw new Error(
          "اختر وسيلة السحب"
        );
      }

      if (!selected.enabled) {
        throw new Error(
          "وسيلة السحب متوقفة"
        );
      }

      const cleanAddress =
        address.trim();

      if (!cleanAddress) {
        throw new Error(
          "أدخل عنوان السحب"
        );
      }

      const numericAmount =
        Number(amount);

      if (
        !Number.isFinite(
          numericAmount
        ) ||
        numericAmount <= 0
      ) {
        throw new Error(
          "أدخل مبلغًا صحيحًا"
        );
      }

      if (withdrawalSource === "package") {
        if (!selectedPackageId || !selectedPackage) {
          throw new Error("اختر الباقة التي تريد السحب من رصيدها");
        }
        if (selected.asset !== "USDT") {
          throw new Error("سحب أرباح الباقة متاح حاليًا بعملة USDT فقط");
        }
        if (packageFirstWithdrawalPending) {
          throw new Error("أول طلب سحب من هذه الباقة ما زال قيد المراجعة.");
        }
        if (numericAmount > packageWithdrawalMax) {
          throw new Error(packageWithdrawalMax > 0
            ? "المتاح للسحب الآن من هذه الباقة هو " + packageWithdrawalMax + " USDT فقط، حسب قواعد السحب والإحالات النشطة."
            : packageFirstWithdrawal
              ? "لا يوجد رصيد محقق متاح لأول سحب من هذه الباقة."
              : "لا يوجد حد سحب متاح حاليًا. تحتاج إلى إيداعات خارجية معتمدة جديدة من إحالات نشطة.");
        }
        if (numericAmount > selectedPackage.availableEarnings) {
          throw new Error("مبلغ السحب أكبر من الرصيد المتاح في هذه الباقة");
        }
      }

      if (
        numericAmount <
        selected.minWithdrawal
      ) {
        throw new Error(
          `الحد الأدنى للسحب هو ${selected.minWithdrawal} ${selected.asset}`
        );
      }

      if (
        selected.maxWithdrawal &&
        selected.maxWithdrawal > 0 &&
        numericAmount >
          selected.maxWithdrawal
      ) {
        throw new Error(
          `الحد الأقصى للسحب هو ${selected.maxWithdrawal} ${selected.asset}`
        );
      }

      const res = await fetch(
        "/api/withdrawals",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            asset: selected.asset,
            network: selected.network,
            address: cleanAddress,
            amount: numericAmount,
            source: withdrawalSource,
            userPackageId: withdrawalSource === "package" ? selectedPackageId : undefined,
          }),
        }
      );

      const data =
        await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.message ||
            "تعذر إرسال طلب السحب"
        );
      }

      setMessage(
        data.message ||
          "تم إرسال طلب السحب"
      );

      setAmount("");

      /*
       * لا نمسح العنوان بعد السحب.
       * يظل محفوظًا للمرة القادمة.
       */
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "حدث خطأ أثناء إنشاء طلب السحب"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#050a13] px-4 py-8 text-white md:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">
            السحب
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            اختر نفس وسيلة الدفع المستخدمة في
            المنصة، ثم استخدم عنوان السحب المحفوظ
            أو غيّره.
          </p>
        </div>

        <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-[#18202b] to-[#07101d] p-4">
            <div className="text-xs text-amber-100/80">رصيد الإيداع الموحد · USDT</div>
            <div className="mt-2 text-2xl font-black text-amber-200">{Number(depositBalances.find((item) => item.asset === "USDT")?.available || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })}</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">كل الإيداعات الخارجية المعتمدة في رصيد واحد، ويُستخدم لتفعيل الباقات فقط.</p>
          </div>
          <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#0d2534] to-[#07101d] p-4">
            <div className="text-xs text-cyan-100/80">إجمالي رصيد السحب الموحد · USDT</div>
            <div className="mt-2 text-2xl font-black text-cyan-200">{(Number(balances.find((item) => item.asset === "USDT")?.available || 0) + packageAccounts.reduce((sum, item) => sum + Number(item.availableEarnings || 0), 0)).toLocaleString("en-US", { maximumFractionDigits: 8 })}</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">يشمل رصيد السحب العام وأرصدة أرباح جميع الباقات. التفاصيل ومصدر السحب بالأسفل.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0d2030] to-[#07101d] p-4">
            <div className="text-xs text-slate-400">طلبات السحب المفتوحة</div>
            <div className="mt-2 text-2xl font-black text-amber-200">{history.filter((item) => ["pending", "approved", "processing"].includes(String(item.status))).length}</div>
            <p className="mt-1 text-xs text-slate-500">قيد المراجعة أو التنفيذ</p>
          </div>
        </section>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-2xl border border-green-500/20 bg-green-500/5 p-4 text-green-300">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-10 text-center text-slate-500">
            جاري تحميل بيانات السحب...
          </div>
        ) : methods.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-10 text-center text-slate-500">
            لا توجد وسائل سحب مفعلة حاليًا.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <form
              onSubmit={submit}
              className="rounded-2xl border border-white/10 bg-[#07101d] p-6"
            >
              <div className="mb-4">
                <div className="text-sm text-slate-400">
                  الرصيد المتاح
                </div>

                <div className="mt-1 text-xl font-black">
                  {selectedBalance}{" "}
                  {selected?.asset || ""}
                </div>
              </div>

              <div className="space-y-4">
                <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="text-sm font-bold text-white">الأرصدة المالية منفصلة</div>
                  <p className="mt-1 text-xs leading-6 text-slate-400">رصيد الإيداع يُستخدم لتفعيل الباقات فقط. رصيد السحب العام وأرصدة الباقات مصادر مستقلة، ويجب اختيار المصدر الذي سيتم السحب منه.</p>
                </div>
                <div>
                  <label className="mb-3 block text-sm font-bold">تفاصيل مصدر رصيد السحب</label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => setWithdrawalSource("wallet")} className={withdrawalSource === "wallet" ? "rounded-2xl border border-cyan-300/40 bg-cyan-300/[0.09] p-4 text-right transition" : "rounded-2xl border border-white/10 bg-[#050a13] p-4 text-right transition hover:border-white/20"}>
                      <div className="flex items-center justify-between gap-2"><span className="font-black text-white">رصيد السحب العام</span><span className="text-[10px] text-cyan-200">{withdrawalSource === "wallet" ? "محدد" : "اختيار"}</span></div>
                      <div className="mt-3 text-xl font-black text-cyan-200">{Number(balances.find((item) => item.asset === (selected?.asset || "USDT"))?.available || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} <span className="text-xs">{selected?.asset || "USDT"}</span></div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">السحب من رصيد المحفظة العام فقط، وليس من رصيد الإيداع.</p>
                    </button>
                    <button type="button" onClick={() => {
                      setWithdrawalSource("package");
                      const usdtMethod = methods.find((item) => item.asset === "USDT");
                      if (usdtMethod) selectMethod(usdtMethod._id);
                      const account = packageAccounts.find((item) => Number(item.availableEarnings || 0) > 0);
                      if (account) setSelectedPackageId(account._id);
                    }} className={withdrawalSource === "package" ? "rounded-2xl border border-emerald-300/40 bg-emerald-300/[0.08] p-4 text-right transition" : "rounded-2xl border border-white/10 bg-[#050a13] p-4 text-right transition hover:border-white/20"}>
                      <div className="flex items-center justify-between gap-2"><span className="font-black text-white">رصيد أرباح الباقات</span><span className="text-[10px] text-emerald-200">{withdrawalSource === "package" ? "محدد" : "اختيار"}</span></div>
                      <div className="mt-3 text-xl font-black text-emerald-200">{packageAccounts.reduce((sum, item) => sum + Number(item.availableEarnings || 0), 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} <span className="text-xs">USDT</span></div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">كل باقة لها رصيد مستقل؛ رصيد الإيداع الخارجي غير قابل للسحب المباشر.</p>
                    </button>
                  </div>
                </div>

                {withdrawalSource === "package" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-bold">أرصدة كل حسابات الباقات</label>
                      <p className="mt-1 text-xs leading-6 text-slate-500">اضغط على الباقة التي تريد السحب منها. سيُخصم الطلب من رصيد هذا الحساب فقط.</p>
                    </div>
                    {packageAccounts.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">لا توجد حسابات باقات لها رصيد سحب مسجل حتى الآن.</div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {packageAccounts.map((item) => {
                          const selectedAccount = item._id === selectedPackageId;
                          return (
                            <button
                              key={item._id}
                              type="button"
                              aria-pressed={selectedAccount}
                              onClick={() => { setSelectedPackageId(item._id); setAmount(""); setError(""); setMessage(""); }}
                              className={selectedAccount ? "rounded-xl border border-emerald-300/50 bg-emerald-300/[0.08] p-4 text-right transition" : "rounded-xl border border-white/10 bg-[#050a13] p-4 text-right transition hover:border-white/20"}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-black text-white">{item.packageName}</div>
                                  <div className="mt-1 text-[11px] text-slate-500">{item.status === "active" ? "الباقة النشطة" : "باقة سابقة"}</div>
                                </div>
                                <span className={selectedAccount ? "rounded-full bg-emerald-300/10 px-2 py-1 text-[10px] text-emerald-200" : "rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-400"}>{selectedAccount ? "محدد" : "اختيار"}</span>
                              </div>
                              <div className="mt-4 text-2xl font-black text-emerald-200">{Number(item.availableEarnings || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} <span className="text-xs">USDT رصيد متاح</span></div>
                              <div className="mt-2 text-sm font-bold text-cyan-200">المتاح للسحب الآن: {Number(item.withdrawalLimit || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} USDT</div>
                              <div className="mt-1 text-xs leading-5 text-slate-500">{item.firstWithdrawalStatus === "pending" ? "أول طلب سحب قيد المراجعة" : (item.firstWithdrawalStatus === "completed" || Number(item.totalWithdrawn || 0) > 0) ? "نسبة السحب اللاحق: " + Number(item.referralPackageWithdrawalPercent ?? 50) + "% من إيداعات الإحالات النشطة المعتمدة" : "السحب الأول دون شرط إحالات، وحده حسب قيمة الباقة ونسبة الإدارة"}</div>
                              <div className="mt-1 text-xs text-slate-500">الإحالات النشطة: {Number(item.activeReferralCount || 0)} · حد الإحالات: {Number(item.referralWithdrawalCap || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} USDT · المسحوب من حد الإحالات: {Number(item.referralAlreadyWithdrawn || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} USDT</div>
                              <div className="mt-2 text-xs text-slate-500">قيد المراجعة: {Number(item.lockedEarnings || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} USDT</div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {selectedPackage && (
                      <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4 text-xs leading-6 text-cyan-100/80">
                        {packageFirstWithdrawalPending ? "أول طلب سحب من هذه الباقة قيد المراجعة؛ انتظر حسمه قبل طلب آخر." : packageFirstWithdrawal ? `الحد الأقصى لأول سحب هو مبلغ تفعيل الباقة (${selectedPackage.investedAmount || 0} USDT).` : "تم حسم أول طلب سحب من هذه الباقة."}
                      </div>
                    )}
                    <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] p-4">
                      <div className="text-xs text-slate-400">رصيد السحب العام · USDT</div>
                      <div className="mt-2 text-2xl font-black text-cyan-200">{Number(balances.find((item) => item.asset === "USDT")?.available || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} USDT</div>
                      <p className="mt-1 text-xs leading-5 text-slate-400">هذا الرصيد مستقل عن أرصدة الباقات ورصيد الإيداع. للطلب العام، اختر «رصيد السحب العام» من المصدر أعلاه.</p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-bold">
                    وسيلة السحب
                  </label>

                  <select
                    value={selectedId}
                    onChange={(e) => selectMethod(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3"
                    required
                  >
                    <option value="">
                      اختر وسيلة السحب
                    </option>

                    {methods.filter((method) => withdrawalSource !== "package" || method.asset === "USDT").map(
                      (method) => (
                        <option
                          key={method._id}
                          value={method._id}
                        >
                          {method.name} —{" "}
                          {method.asset} /{" "}
                          {method.network}
                        </option>
                      )
                    )}
                  </select>
                </div>

                {selected && (
                  <>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-sm font-bold">
                        {selected.name}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {selected.asset} ·{" "}
                        {selected.network}
                      </div>

                      <div className="mt-3 text-xs text-slate-500">
                        الحد الأدنى للسحب
                      </div>

                      <div className="mt-1 font-black">
                        {
                          selected.minWithdrawal
                        }{" "}
                        {selected.asset}
                      </div>

                      {selected.maxWithdrawal &&
                        selected.maxWithdrawal >
                          0 && (
                          <>
                            <div className="mt-3 text-xs text-slate-500">
                              الحد الأقصى للسحب
                            </div>

                            <div className="mt-1 font-black">
                              {
                                selected.maxWithdrawal
                              }{" "}
                              {selected.asset}
                            </div>
                          </>
                        )}
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold">
                        عنوان السحب
                      </label>

                      <textarea
                        value={address}
                        onChange={(e) =>
                          setAddress(
                            e.target.value
                          )
                        }
                        rows={3}
                        placeholder="أدخل عنوانك لهذه الوسيلة"
                        className="w-full resize-none rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 outline-none focus:border-blue-500"
                        required
                      />

                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-xs text-slate-500">
                          {savedAddress
                            ? "يوجد عنوان محفوظ لهذه الوسيلة."
                            : "لا يوجد عنوان محفوظ لهذه الوسيلة."}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            void saveCurrentAddress()
                          }
                          disabled={
                            savingAddress ||
                            !address.trim()
                          }
                          className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-300 disabled:opacity-40"
                        >
                          {savingAddress
                            ? "جاري الحفظ..."
                            : savedAddress
                            ? "تحديث العنوان"
                            : "حفظ العنوان"}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold">
                        مبلغ السحب
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={amount}
                        onChange={(e) =>
                          setAmount(
                            e.target.value
                          )
                        }
                        placeholder="المبلغ"
                        max={withdrawalSource === "package" ? packageWithdrawalMax : undefined}
                        disabled={packageFirstWithdrawalPending}
                        className="w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 disabled:opacity-50"
                        required
                      />
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
                      <div className="flex justify-between py-1">
                        <span className="text-slate-500">
                          الرسوم
                        </span>

                        <span>
                          {fee}{" "}
                          {selected.asset}
                        </span>
                      </div>

                      <div className="flex justify-between py-1">
                        <span className="text-slate-500">
                          المبلغ المستلم
                        </span>

                        <span className="font-black">
                          {receive}{" "}
                          {selected.asset}
                        </span>
                      </div>
                    </div>

                    {selected.warning && (
                      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-300">
                        {selected.warning}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-xl bg-white px-4 py-3 font-semibold text-black disabled:opacity-40"
                    >
                      {submitting
                        ? "جاري إرسال الطلب..."
                        : "طلب السحب"}
                    </button>
                  </>
                )}
              </div>
            </form>

            <section className="rounded-2xl border border-white/10 bg-[#07101d]">
              <div className="border-b border-white/10 p-5">
                <h2 className="font-semibold">
                  سجل السحب
                </h2>
              </div>

              <div className="divide-y divide-white/5">
                {history.length === 0 && (
                  <div className="p-8 text-center text-slate-500">
                    لا توجد طلبات سحب.
                  </div>
                )}

                {history.map((item) => (
                  <div
                    key={item._id}
                    className="p-5"
                  >
                    <div className="flex justify-between gap-4">
                      <div>
                        <div className="font-semibold">
                          {item.amount}{" "}
                          {item.asset}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {item.network}
                        </div>

                        <div className="mt-2 break-all text-xs text-slate-600">
                          {item.address}
                        </div>
                      </div>

                      <div className={"inline-flex rounded-full border px-3 py-1 text-xs font-bold " + (item.status === "completed" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : item.status === "rejected" ? "border-red-400/20 bg-red-400/10 text-red-200" : item.status === "approved" || item.status === "processing" ? "border-blue-400/20 bg-blue-400/10 text-blue-200" : "border-amber-400/20 bg-amber-400/10 text-amber-200")}>
                          {item.status === "pending" ? "قيد المراجعة" : item.status === "approved" ? "تمت الموافقة" : item.status === "processing" ? "قيد التنفيذ" : item.status === "completed" ? "مكتمل" : item.status === "rejected" ? "مرفوض" : item.status === "failed" ? "فشل التنفيذ" : item.status}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">{item.source === "package" ? "سحب من رصيد باقة" : "سحب عام"} · {new Date(item.createdAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</div>
                        {item.fee !== undefined && <div className="mt-1 text-xs text-slate-500">الرسوم: {Number(item.fee || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} · الصافي: {Number(item.receiveAmount || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} {item.asset}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}