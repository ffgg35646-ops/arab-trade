"use client";

import AdminPageFrame from "@/components/AdminPageFrame";
import { useCallback, useEffect, useState } from "react";

type Network = {
  _id?: string;
  name: string;
  code: string;
  enabled: boolean;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  depositAddress: string;
  memoTag: string;
  confirmations: number;
  minDeposit: number;
  maxDeposit: number;
  minWithdrawal: number;
  maxWithdrawal: number;
  withdrawalFee: number;
  warning: string;
  sortOrder: number;
};

type Asset = {
  _id: string;
  name: string;
  symbol: string;
  enabled: boolean;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  tradingEnabled: boolean;
  sortOrder: number;
  networks: Network[];
};

const emptyNetwork: Network = {
  name: "",
  code: "",
  enabled: true,
  depositEnabled: true,
  withdrawalEnabled: true,
  depositAddress: "",
  memoTag: "",
  confirmations: 12,
  minDeposit: 10,
  maxDeposit: 100000,
  minWithdrawal: 50,
  maxWithdrawal: 50000,
  withdrawalFee: 0,
  warning: "",
  sortOrder: 0,
};

export default function AssetsAdminPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [search, setSearch] = useState("");

  const [newName, setNewName] = useState("");
  const [newSymbol, setNewSymbol] = useState("");

  const [networkAsset, setNetworkAsset] = useState("");
  const [network, setNetwork] = useState<Network>(emptyNetwork);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch("/api/admin/assets", {
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.message || "تعذر تحميل العملات");
      }

      setAssets(json.assets || []);
    } catch (error) {
      alert(error instanceof Error ? error.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addAsset() {
    if (!newName.trim() || !newSymbol.trim()) {
      alert("اكتب اسم العملة والرمز");
      return;
    }

    const res = await fetch("/api/admin/assets", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: newName,
        symbol: newSymbol,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(json?.message || "تعذر إضافة العملة");
      return;
    }

    setNewName("");
    setNewSymbol("");
    await load();
  }

  async function updateAsset(
    id: string,
    patch: Partial<Asset>
  ) {
    setSaving(id);

    try {
      const res = await fetch("/api/admin/assets", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          ...patch,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json?.message || json?.error || "تعذر تحديث العملة"
        );
      }

      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "حدث خطأ");
    } finally {
      setSaving("");
    }
  }

  async function updateNetworkEnabled(
    asset: Asset,
    networkId: string | undefined,
    code: string,
    enabled: boolean
  ) {
    const updated = (asset.networks || []).map((net) =>
      (networkId && net._id === networkId) ||
      (!networkId && net.code === code)
        ? { ...net, enabled }
        : net
    );

    await updateAsset(asset._id, {
      networks: updated,
    });
  }

  function updateLocalAsset(
    id: string,
    patch: Partial<Asset>
  ) {
    setAssets((current) =>
      current.map((item) =>
        item._id === id ? { ...item, ...patch } : item
      )
    );
  }

  function updateLocalNetwork(
    assetId: string,
    networkId: string | undefined,
    code: string,
    patch: Partial<Network>
  ) {
    setAssets((current) =>
      current.map((asset) => {
        if (asset._id !== assetId) return asset;

        return {
          ...asset,
          networks: (asset.networks || []).map((net) => {
            const sameNetwork =
              (networkId && net._id === networkId) ||
              (!networkId && net.code === code);

            return sameNetwork
              ? { ...net, ...patch }
              : net;
          }),
        };
      })
    );
  }

  async function saveAssetChanges(asset: Asset) {
    setSaving(asset._id);

    try {
      const res = await fetch("/api/admin/assets", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: asset._id,
          name: asset.name,
          enabled: asset.enabled,
          depositEnabled: asset.depositEnabled,
          withdrawalEnabled: asset.withdrawalEnabled,
          tradingEnabled: asset.tradingEnabled,
          sortOrder: asset.sortOrder,
          networks: asset.networks || [],
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json?.message ||
          json?.error ||
          "تعذر حفظ تغييرات العملة"
        );
      }

      setAssets((current) =>
        current.map((item) =>
          item._id === asset._id
            ? { ...item, ...(json.asset || {}) }
            : item
        )
      );

      alert("تم حفظ تغييرات العملة");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "حدث خطأ"
      );
    } finally {
      setSaving("");
    }
  }

  async function setAllAssets(enabled: boolean) {
    setSaving("all");

    try {
      const results = await Promise.all(
        assets.map(async (asset) => {
          const networks = (asset.networks || []).map((net) => ({
            ...net,
            enabled,
          }));

          const res = await fetch("/api/admin/assets", {
            method: "PATCH",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: asset._id,
              enabled,
              networks,
            }),
          });

          const json = await res.json().catch(() => ({}));

          if (!res.ok) {
            throw new Error(
              json?.message ||
                json?.error ||
                `تعذر تحديث ${asset.symbol}`
            );
          }

          return json.asset;
        })
      );

      setAssets((current) =>
        current.map((asset) => {
          const updated = results.find(
            (item: any) =>
              String(item?._id) === String(asset._id)
          );

          return updated
            ? {
                ...asset,
                ...updated,
                _id: String(updated._id),
              }
            : asset;
        })
      );
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "تعذر تحديث العملات"
      );
    } finally {
      setSaving("");
    }
  }

  async function addNetwork() {
    const asset = assets.find((item) => item._id === networkAsset);

    if (!asset) {
      alert("اختر العملة");
      return;
    }

    if (!network.name.trim() || !network.code.trim()) {
      alert("اسم الشبكة والرمز مطلوبان");
      return;
    }

    const updated = [
      ...(asset.networks || []),
      {
        ...network,
        name: network.name.trim(),
        code: network.code.trim().toUpperCase(),
      },
    ];

    await updateAsset(asset._id, {
      networks: updated,
    });

    setNetwork(emptyNetwork);
    setNetworkAsset("");
  }

  const filtered = assets.filter((asset) => {
    const q = search.trim().toLowerCase();

    if (!q) return true;

    return (
      asset.name.toLowerCase().includes(q) ||
      asset.symbol.toLowerCase().includes(q)
    );
  });

  return (
    <AdminPageFrame title="الأصول والشبكات">
      <div dir="rtl" className="space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-[#08111e] p-6">
          <h2 className="text-xl font-black">إضافة عملة</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="اسم العملة"
              className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
            />

            <input
              value={newSymbol}
              onChange={(e) =>
                setNewSymbol(e.target.value.toUpperCase())
              }
              placeholder="الرمز مثل BTC"
              className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 uppercase outline-none"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#08111e] p-6">
          <h2 className="text-xl font-black">إضافة شبكة لعملة</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={networkAsset}
              onChange={(e) => setNetworkAsset(e.target.value)}
              className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
            >
              <option value="">اختر العملة</option>
              {assets.map((asset) => (
                <option key={asset._id} value={asset._id}>
                  {asset.name} ({asset.symbol})
                </option>
              ))}
            </select>

            <input
              value={network.name}
              onChange={(e) =>
                setNetwork({ ...network, name: e.target.value })
              }
              placeholder="اسم الشبكة"
              className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
            />

            <input
              value={network.code}
              onChange={(e) =>
                setNetwork({
                  ...network,
                  code: e.target.value.toUpperCase(),
                })
              }
              placeholder="رمز الشبكة مثل TRC20"
              className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 uppercase outline-none"
            />

            <input
              value={network.depositAddress}
              onChange={(e) =>
                setNetwork({
                  ...network,
                  depositAddress: e.target.value,
                })
              }
              placeholder="عنوان الإيداع"
              className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
            />

            <input
              value={network.minDeposit}
              onChange={(e) =>
                setNetwork({
                  ...network,
                  minDeposit: Number(e.target.value),
                })
              }
              type="number"
              min="0"
              step="any"
              placeholder="الحد الأدنى للإيداع"
              className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
            />

            <input
              value={network.maxDeposit}
              onChange={(e) =>
                setNetwork({
                  ...network,
                  maxDeposit: Number(e.target.value),
                })
              }
              type="number"
              min="0"
              step="any"
              placeholder="الحد الأقصى للإيداع"
              className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
            />

            <input
              value={network.minWithdrawal}
              onChange={(e) =>
                setNetwork({
                  ...network,
                  minWithdrawal: Number(e.target.value),
                })
              }
              type="number"
              min="0"
              step="any"
              placeholder="الحد الأدنى للسحب"
              className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
            />

            <input
              value={network.withdrawalFee}
              onChange={(e) =>
                setNetwork({
                  ...network,
                  withdrawalFee: Number(e.target.value),
                })
              }
              type="number"
              min="0"
              step="any"
              placeholder="رسوم السحب"
              className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
            />
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم العملة أو الرمز..."
              className="flex-1 rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
            />

            <button
              onClick={() => void load()}
              className="rounded-xl border border-slate-700 bg-[#0b1422] px-5 py-3 font-bold"
            >
              تحديث
            </button>

            <button
              disabled={saving === "all"}
              onClick={() => void setAllAssets(true)}
              className="rounded-xl bg-emerald-600 px-5 py-3 font-black"
            >
              تفعيل الكل
            </button>

            <button
              disabled={saving === "all"}
              onClick={() => void setAllAssets(false)}
              className="rounded-xl bg-red-600 px-5 py-3 font-black"
            >
              إيقاف الكل
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-12 text-center text-slate-500">
              جاري تحميل العملات...
            </div>
          ) : (
            <div className="grid gap-4">
              {filtered.map((asset) => (
                <div
                  key={asset._id}
                  className="rounded-2xl border border-slate-800 bg-[#08111e] p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-lg font-black">
                        {asset.name}
                      </div>
                      <div className="mt-1 text-sm font-black text-blue-400">
                        {asset.symbol}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving === asset._id}
                        onClick={() =>
                          void updateAsset(asset._id, {
                            enabled: !asset.enabled,
                          })
                        }
                        className={`rounded-lg px-3 py-2 text-xs font-bold ${
                          asset.enabled
                            ? "bg-emerald-600"
                            : "bg-red-600"
                        }`}
                      >
                        {asset.enabled ? "تفعيل العملة: مفعل" : "تفعيل العملة: متوقف"}
                      </button>

                      <button
                        type="button"
                        disabled={saving === asset._id}
                        onClick={() =>
                          void updateAsset(asset._id, {
                            tradingEnabled:
                              !asset.tradingEnabled,
                          })
                        }
                        className={`rounded-lg px-3 py-2 text-xs font-bold ${
                          asset.tradingEnabled
                            ? "bg-blue-600"
                            : "bg-slate-700"
                        }`}
                      >
                        التداول {asset.tradingEnabled ? "مفعل" : "متوقف"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-5 border-t border-slate-800 pt-4">
                    <div className="mb-3 font-bold">
                      الشبكات ({asset.networks?.length || 0})
                    </div>

                    {asset.networks?.length ? (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">                        {asset.networks.map((net) => (
                          <div
                            key={net._id || net.code}
                            className="rounded-xl border border-slate-800 bg-[#0b1422] p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="font-black">
                                  {net.name}
                                </div>

                                <div className="text-xs text-slate-500">
                                  {net.code}
                                </div>
                              </div>

                              <button
                                type="button"
                                disabled={saving === asset._id}
                                onClick={() => {
                                  const networks =
                                    (asset.networks || []).map((item) =>
                                      item._id === net._id ||
                                      (!item._id &&
                                        !net._id &&
                                        item.code === net.code)
                                        ? {
                                            ...item,
                                            enabled: !item.enabled,
                                          }
                                        : item
                                    );

                                  void updateAsset(asset._id, {
                                    networks,
                                  });
                                }}
                                className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${
                                  asset.enabled && net.enabled
                                    ? "bg-emerald-500/10 text-emerald-300"
                                    : "bg-red-500/10 text-red-300"
                                }`}
                              >
                                {asset.enabled && net.enabled ? "مفعل" : "متوقف"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">
                        لا توجد شبكات مضافة لهذه العملة.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminPageFrame>
  );
}