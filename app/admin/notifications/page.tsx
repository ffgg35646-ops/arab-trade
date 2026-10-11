"use client";

import { useEffect, useRef, useState } from "react";
import AdminPageFrame from "@/components/AdminPageFrame";

type Target = "user" | "all";
type SearchBy = "email" | "arabTradeId";

type UserResult = {
  _id: string;
  name: string;
  username: string;
  email: string;
  arabTradeId?: number;
};

export default function Page() {
  const [target, setTarget] = useState<Target>("user");
  const [searchBy, setSearchBy] = useState<SearchBy>("email");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [selectedUser, setSelectedUser] =
    useState<UserResult | null>(null);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [resultMessage, setResultMessage] = useState("");

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    if (target !== "user") {
      setResults([]);
      setSelectedUser(null);
      return;
    }

    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
    }

    searchTimer.current = setTimeout(async () => {
      setSearching(true);

      try {
        const params = new URLSearchParams({
          q: query.trim(),
          searchBy,
        });

        const res = await fetch(
          `/api/admin/notifications?${params.toString()}`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );

        const json = await res.json();

        if (res.ok && json.success) {
          setResults(
            Array.isArray(json.users) ? json.users : []
          );
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => {
      if (searchTimer.current) {
        clearTimeout(searchTimer.current);
      }
    };
  }, [query, searchBy, target]);

  async function sendNotification() {
    setResultMessage("");

    if (!message.trim()) {
      setResultMessage("اكتب نص الرسالة");
      return;
    }

    if (target === "user" && !selectedUser) {
      setResultMessage("اختر المستخدم من نتائج البحث");
      return;
    }

    setSending(true);

    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target,
          userId:
            target === "user"
              ? selectedUser?._id
              : undefined,
          title:
            title.trim() ||
            "إشعار من إدارة ArabTrade",
          message: message.trim(),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        throw new Error(
          json?.message || "تعذر إرسال الإشعار"
        );
      }

      setResultMessage(
        json.message ||
          `تم إرسال الإشعار إلى ${json.count || 0} مستخدم`
      );

      setMessage("");

      if (target === "user") {
        setQuery("");
        setResults([]);
        setSelectedUser(null);
      }
    } catch (error) {
      setResultMessage(
        error instanceof Error
          ? error.message
          : "حدث خطأ أثناء إرسال الإشعار"
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <AdminPageFrame title="الإشعارات">
      <div
        dir="rtl"
        className="mx-auto w-full max-w-3xl"
      >
        <section className="rounded-2xl border border-slate-800 bg-[#08111e] p-6 shadow-xl">
          <h2 className="text-center text-xl font-black">
            إرسال إشعار
          </h2>

          <p className="mt-2 text-center text-sm text-slate-500">
            إرسال رسالة إلى مستخدم محدد أو إلى جميع المستخدمين
          </p>

          <div className="mt-6">
            <label className="mb-2 block text-sm font-bold">
              إرسال إلى
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTarget("user");
                  setResultMessage("");
                }}
                className={`rounded-xl px-4 py-3 font-black ${
                  target === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-[#0b1422] text-slate-400"
                }`}
              >
                مستخدم محدد
              </button>

              <button
                type="button"
                onClick={() => {
                  setTarget("all");
                  setQuery("");
                  setResults([]);
                  setSelectedUser(null);
                  setResultMessage("");
                }}
                className={`rounded-xl px-4 py-3 font-black ${
                  target === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-[#0b1422] text-slate-400"
                }`}
              >
                جميع المستخدمين
              </button>
            </div>
          </div>

          {target === "user" ? (
            <div className="mt-5">
              <label className="mb-2 block text-sm font-bold">
                البحث عن المستخدم
              </label>

              <div className="mb-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchBy("email");
                    setQuery("");
                    setResults([]);
                    setSelectedUser(null);
                  }}
                  className={`rounded-xl px-4 py-2.5 text-xs font-black ${
                    searchBy === "email"
                      ? "bg-slate-700 text-white"
                      : "bg-[#0b1422] text-slate-500"
                  }`}
                >
                  البريد الإلكتروني
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSearchBy("arabTradeId");
                    setQuery("");
                    setResults([]);
                    setSelectedUser(null);
                  }}
                  className={`rounded-xl px-4 py-2.5 text-xs font-black ${
                    searchBy === "arabTradeId"
                      ? "bg-slate-700 text-white"
                      : "bg-[#0b1422] text-slate-500"
                  }`}
                >
                  ArabTrade ID
                </button>
              </div>

              <div className="relative">
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedUser(null);
                  }}
                  placeholder={
                    searchBy === "email"
                      ? "ابدأ بكتابة البريد، مثل go"
                      : "اكتب ArabTrade ID، مثل 584"
                  }
                  className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
                />

                {query.trim() ? (
                  <div className="absolute right-0 left-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-700 bg-[#0b1422] shadow-2xl">
                    {searching ? (
                      <div className="p-4 text-center text-sm text-slate-500">
                        جاري البحث...
                      </div>
                    ) : results.length === 0 ? (
                      <div className="p-4 text-center text-sm text-slate-500">
                        لا توجد نتائج
                      </div>
                    ) : (
                      results.map((user) => (
                        <button
                          key={user._id}
                          type="button"
                          onClick={() => {
                            setSelectedUser(user);
                            setQuery(
                              searchBy === "email"
                                ? user.email
                                : String(
                                    user.arabTradeId ?? ""
                                  )
                            );
                            setResults([]);
                          }}
                          className="block w-full border-b border-slate-800 px-4 py-3 text-right last:border-b-0 hover:bg-white/[0.04]"
                        >
                          <div className="font-bold text-white">
                            {user.name}
                          </div>

                          <div className="mt-1 text-xs text-slate-400">
                            {user.email}
                          </div>

                          <div className="mt-1 text-xs text-blue-400">
                            ArabTrade ID:{" "}
                            {user.arabTradeId ?? "—"}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>

              {selectedUser ? (
                <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="text-sm font-black text-emerald-300">
                    تم اختيار المستخدم
                  </div>

                  <div className="mt-2 text-sm text-white">
                    {selectedUser.name}
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    {selectedUser.email}
                  </div>

                  <div className="mt-1 text-xs text-blue-400">
                    ID: {selectedUser.arabTradeId ?? "—"}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5">
            <label className="mb-2 block text-sm font-bold">
              عنوان الإشعار
            </label>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="إشعار من إدارة ArabTrade"
              className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
            />
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-bold">
              نص الرسالة
            </label>

            <textarea
              rows={7}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="اكتب رسالتك..."
              className="w-full resize-y rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
            />
          </div>

          {resultMessage ? (
            <div className="mt-4 rounded-xl border border-slate-700 bg-[#0b1422] p-4 text-sm text-slate-300">
              {resultMessage}
            </div>
          ) : null}

          <button
            type="button"
            disabled={sending}
            onClick={() => void sendNotification()}
            className="mt-5 w-full rounded-xl bg-blue-600 px-5 py-4 font-black disabled:opacity-50"
          >
            {sending
              ? "جاري إرسال الإشعار..."
              : "إرسال الإشعار"}
          </button>
        </section>
      </div>
    </AdminPageFrame>
  );
}