"use client";

import { useEffect, useMemo, useState } from "react";

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
};

export default function WithdrawPage() {
  const [methods, setMethods] = useState<Method[]>([]);
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

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");

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

      setBalances(
        walletData.wallets?.spot?.balances ||
          []
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
        setSelectedId(
          (current) =>
            current &&
            rows.some(
              (item) => item._id === current
            )
              ? current
              : rows[0]._id
        );
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
  }

  const selected = useMemo(
    () =>
      methods.find(
        (method) =>
          method._id === selectedId
      ) || null,
    [methods, selectedId]
  );

  const selectedPackage = packageAccounts.find((item) => item._id === selectedPackageId);
  const packageFirstStatus = selectedPackage?.firstWithdrawalStatus || (Number(selectedPackage?.totalWithdrawn || 0) > 0 ? "completed" : "available");
  const packageFirstWithdrawalPending = withdrawalSource === "package" && packageFirstStatus === "pending";
  const packageFirstWithdrawal = withdrawalSource === "package" && packageFirstStatus === "available";
  const packageWithdrawalMax = selectedPackage ? (packageFirstWithdrawal ? Math.min(Number(selectedPackage.availableEarnings || 0), Number(selectedPackage.investedAmount || 0)) : Number(selectedPackage.availableEarnings || 0)) : 0;
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

  useEffect(() => {
    if (savedAddress) {
      setAddress(savedAddress.address);
    } else {
      setAddress("");
    }

    setAmount("");
    setError("");
    setMessage("");
  }, [
    selectedId,
    savedAddress?.address,
  ]);

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
        if (packageFirstWithdrawal && numericAmount > Number(selectedPackage.investedAmount || 0)) {
          throw new Error(`الحد الأقصى لأول سحب هو مبلغ تفعيل الباقة: ${selectedPackage?.investedAmount || 0} USDT`);
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
                <div>
                  <label className="mb-2 block text-sm font-bold">مصدر رصيد السحب</label>
                  <select
                    value={withdrawalSource}
                    onChange={(e) => {
                      const next = e.target.value === "package" ? "package" : "wallet";
                      setWithdrawalSource(next);
                      if (next === "package") {
                        const usdtMethod = methods.find((item) => item.asset === "USDT");
                        if (usdtMethod) setSelectedId(usdtMethod._id);
                        const account = packageAccounts.find((item) => Number(item.availableEarnings || 0) > 0);
                        if (account) setSelectedPackageId(account._id);
                      }
                    }}
                    className="w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3"
                  >
                    <option value="wallet">رصيد السحب العام</option>
                    <option value="package">رصيد أرباح باقة محددة</option>
                  </select>
                </div>

                {withdrawalSource === "package" && (
                  <div>
                    <label className="mb-2 block text-sm font-bold">الباقة التي سيتم السحب منها</label>
                    <select
                      value={selectedPackageId}
                      onChange={(e) => setSelectedPackageId(e.target.value)}
                      required
                      className="w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3"
                    >
                      <option value="">اختر الباقة</option>
                      {packageAccounts.map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.packageName} — متاح {Number(item.availableEarnings || 0).toFixed(2)} USDT
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs leading-5 text-slate-500">يتم السحب من رصيد هذه الباقة فقط، ورصيد الإيداع الخارجي لا يُسحب مباشرة.</p>{packageFirstWithdrawalPending ? <p className="mt-2 text-xs font-bold text-amber-300">أول طلب سحب من الباقة قيد المراجعة؛ انتظر حسمه قبل طلب آخر.</p> : packageFirstWithdrawal ? <p className="mt-2 text-xs font-bold text-cyan-300">الحد الأقصى لأول سحب هو مبلغ تفعيل الباقة ({selectedPackage.investedAmount} USDT). بعد حسم أول طلب، يمكنك سحب الرصيد المحقق المتاح دون شرط إحالات.</p> : <p className="mt-2 text-xs text-slate-500">أول طلب سحب حُسم بالفعل؛ يمكنك سحب رصيد الباقة المحقق والمتاح وفق حدود المنصة.</p>}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-bold">
                    وسيلة السحب
                  </label>

                  <select
                    value={selectedId}
                    onChange={(e) =>
                      setSelectedId(
                        e.target.value
                      )
                    }
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

                      <div className="text-sm">
                        {item.status}
                      </div>
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