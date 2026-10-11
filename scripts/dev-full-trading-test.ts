import mongoose from "mongoose";

import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Wallet from "@/models/Wallet";
import Asset from "@/models/Asset";
import LedgerEntry from "@/models/LedgerEntry";

const BASE = "http://127.0.0.1:3000";

let PASS = 0;
let FAIL = 0;

function test(name: string, ok: boolean, detail = "") {
  if (ok) {
    PASS++;
    console.log(`[PASS] ${name}`);
  } else {
    FAIL++;
    console.log(`[FAIL] ${name}`);
  }

  if (detail) console.log(`       ${detail}`);
}

async function api(
  path: string,
  init: RequestInit = {},
  cookie = ""
) {
  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");

  if (cookie) {
    headers.set("Cookie", cookie);
  }

  const res = await fetch(BASE + path, {
    ...init,
    headers,
  });

  const text = await res.text();

  let data: any = text;

  try {
    data = JSON.parse(text);
  } catch {}

  return {
    status: res.status,
    headers: res.headers,
    data,
  };
}

function extractCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    return "";
  }

  return setCookie.split(";")[0];
}

async function main() {
  await connectDB();

  // ==========================================================
  // DETERMINISTIC DEV SELLER RESET
  // يعيد رصيد البائع إلى 1 BTC قبل كل تشغيل للاختبار
  // ==========================================================
  {
    const db = mongoose.connection.db;

    if (!db) {
      throw new Error("MongoDB connection is not ready");
    }

    const sellerUser = await db.collection("users").findOne({
      email: "dev-seller@arabtrade.local"
    });

    if (!sellerUser) {
      throw new Error("DEV_SELLER_NOT_FOUND");
    }

    const sellerWallet = await db.collection("wallets").findOne({
      userId: sellerUser._id,
      type: "spot"
    });

    if (!sellerWallet) {
      await db.collection("wallets").insertOne({
        userId: sellerUser._id,
        type: "spot",
        balances: [
          {
            asset: "BTC",
            available: 1,
            locked: 0
          }
        ]
      });
    } else {
      const balances = Array.isArray(sellerWallet.balances)
        ? sellerWallet.balances
        : [];

      const btcIndex = balances.findIndex(
        (item: any) =>
          String(item.asset).toUpperCase() === "BTC"
      );

      if (btcIndex === -1) {
        balances.push({
          asset: "BTC",
          available: 1,
          locked: 0
        });
      } else {
        balances[btcIndex].available = 1;
        balances[btcIndex].locked = 0;
      }

      await db.collection("wallets").updateOne(
        { _id: sellerWallet._id },
        { $set: { balances } }
      );
    }

    console.log("[PASS] تهيئة رصيد بائع الاختبار");
    console.log("       BTC=1 available / 0 locked");
  }



  console.log("==================================================");
  console.log("ArabTrade - Full Spot Trading Development Test");
  console.log("==================================================");

  /*
   * ------------------------------------------------
   * 1. تجهيز الأصول المحلية
   * ------------------------------------------------
   */

  const btc = await Asset.findOneAndUpdate(
    { symbol: "BTC" },
    {
      $set: {
        name: "بيتكوين",
        symbol: "BTC",
        type: "crypto",
        enabled: true,
        depositEnabled: false,
        withdrawalEnabled: false,
        tradingEnabled: true,
        sortOrder: 1,
        networks: [],
      },
    },
    {
      new: true,
      upsert: true,
    }
  );

  const usdt = await Asset.findOneAndUpdate(
    { symbol: "USDT" },
    {
      $set: {
        name: "تيثر",
        symbol: "USDT",
        type: "crypto",
        enabled: true,
        depositEnabled: false,
        withdrawalEnabled: false,
        tradingEnabled: true,
        sortOrder: 2,
        networks: [],
      },
    },
    {
      new: true,
      upsert: true,
    }
  );

  test(
    "BTC asset",
    Boolean(btc)
  );

  test(
    "USDT asset",
    Boolean(usdt)
  );

  /*
   * ------------------------------------------------
   * 2. تجهيز حساب البائع
   * ------------------------------------------------
   */

  const sellerEmail = "dev-seller@arabtrade.local";
  const sellerUsername = "devseller";
  const sellerPassword = "DevOnly-ChangeMe-9026";

  const hashed = await bcrypt.hash(sellerPassword, 12);

  const seller = await User.findOneAndUpdate(
    { email: sellerEmail },
    {
      $set: {
        name: "بائع اختبار التطوير",
        username: sellerUsername,
        email: sellerEmail,
        password: hashed,
        role: "user",
        isVerified: true,
        isActive: true,
        referralCode: "DEVSELLER9026",
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    {
      new: true,
      upsert: true,
    }
  );

  test(
    "إنشاء/تجهيز حساب البائع",
    Boolean(seller)
  );

  /*
   * ------------------------------------------------
   * 3. تجهيز محافظ الاختبار
   * ------------------------------------------------
   */

  const buyerEmail = process.env.ADMIN_LEADER_EMAIL;

  if (!buyerEmail) {
    throw new Error("ADMIN_LEADER_EMAIL غير موجود");
  }

  const buyer = await User.findOne({ email: buyerEmail })
    .select("_id email role");

  if (!buyer) {
    throw new Error("حساب المشتري/الأدمن غير موجود");
  }

  /*
   * المشتري:
   * إضافة 1000 USDT فقط إذا كان رصيده أقل من 1000.
   */

  let buyerWallet = await Wallet.findOne({
    userId: buyer._id,
    type: "spot",
  });

  if (!buyerWallet) {
    buyerWallet = new Wallet({
      userId: buyer._id,
      type: "spot",
      balances: [],
    });
  }

  let buyerUsdt = buyerWallet.balances.find(
    (b: any) => b.asset === "USDT"
  );

  if (!buyerUsdt) {
    buyerWallet.balances.push({
      asset: "USDT",
      available: 1000,
      locked: 0,
    });

    await buyerWallet.save();

    await LedgerEntry.create({
      userId: buyer._id,
      asset: "USDT",
      type: "adjustment",
      amount: 1000,
      balanceBefore: 0,
      balanceAfter: 1000,
      referenceId: "DEV_TRADING_TEST",
      note: "رصيد تطوير محلي للاختبار فقط",
    });
  } else if (buyerUsdt.available < 100) {
    const before = buyerUsdt.available;

    buyerUsdt.available += 1000;
    await buyerWallet.save();

    await LedgerEntry.create({
      userId: buyer._id,
      asset: "USDT",
      type: "adjustment",
      amount: 1000,
      balanceBefore: before,
      balanceAfter: buyerUsdt.available,
      referenceId: "DEV_TRADING_TEST",
      note: "رصيد تطوير محلي للاختبار فقط",
    });
  }

  /*
   * البائع:
   * ضمان وجود 1 BTC على الأقل.
   */

  let sellerWallet = await Wallet.findOne({
    userId: seller._id,
    type: "spot",
  });

  if (!sellerWallet) {
    sellerWallet = new Wallet({
      userId: seller._id,
      type: "spot",
      balances: [],
    });
  }

  let sellerBtc = sellerWallet.balances.find(
    (b: any) => b.asset === "BTC"
  );

  if (!sellerBtc) {
    sellerWallet.balances.push({
      asset: "BTC",
      available: 1,
      locked: 0,
    });

    await sellerWallet.save();

    await LedgerEntry.create({
      userId: seller._id,
      asset: "BTC",
      type: "adjustment",
      amount: 1,
      balanceBefore: 0,
      balanceAfter: 1,
      referenceId: "DEV_TRADING_TEST",
      note: "رصيد تطوير محلي للاختبار فقط",
    });
  } else if (sellerBtc.available < 1) {
    throw new Error("البائع لا يملك 1 BTC متاحًا للاختبار");
  }

  test(
    "تجهيز رصيد المشتري USDT",
    true
  );

  test(
    "تجهيز رصيد البائع BTC",
    true
  );

  /*
   * ------------------------------------------------
   * 4. Login للمشتري
   * ------------------------------------------------
   */

  const buyerPassword = process.env.ADMIN_LEADER_PASSWORD;

  if (!buyerPassword) {
    throw new Error("ADMIN_LEADER_PASSWORD غير موجود");
  }

  const buyerLogin = await api(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        identifier: buyerEmail,
        password: buyerPassword,
      }),
    }
  );

  const buyerCookie = extractCookie(buyerLogin.headers);

  test(
    "تسجيل دخول المشتري",
    buyerLogin.status === 200 &&
      Boolean(buyerCookie),
    `HTTP ${buyerLogin.status}`
  );

  /*
   * ------------------------------------------------
   * 5. Login للبائع
   * ------------------------------------------------
   */

  const sellerLogin = await api(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        identifier: sellerEmail,
        password: sellerPassword,
      }),
    }
  );

  const sellerCookie = extractCookie(sellerLogin.headers);

  test(
    "تسجيل دخول البائع",
    sellerLogin.status === 200 &&
      Boolean(sellerCookie),
    `HTTP ${sellerLogin.status}`
  );

  if (!buyerCookie || !sellerCookie) {
    throw new Error("تعذر إنشاء جلسات الاختبار");
  }

  /*
   * ------------------------------------------------
   * 6. فحص الأرصدة قبل التداول
   * ------------------------------------------------
   */

  const beforeBuyer = await api(
    "/api/wallet",
    {},
    buyerCookie
  );

  const beforeSeller = await api(
    "/api/wallet",
    {},
    sellerCookie
  );

  test(
    "محفظة المشتري تعمل",
    beforeBuyer.status === 200
  );

  test(
    "محفظة البائع تعمل",
    beforeSeller.status === 200
  );

  /*
   * ------------------------------------------------
   * 7. إنشاء أمر SELL
   * السعر 100 USDT
   * الكمية 1 BTC
   * ------------------------------------------------
   */

  const sellOrder = await api(
    "/api/orders",
    {
      method: "POST",
      body: JSON.stringify({
        symbol: "BTCUSDT",
        side: "sell",
        type: "limit",
        price: 100,
        quantity: 1,
      }),
    },
    sellerCookie
  );

  test(
    "إنشاء أمر بيع BTCUSDT",
    sellOrder.status === 201 &&
      sellOrder.data?.success === true,
    `HTTP ${sellOrder.status} | ${JSON.stringify(sellOrder.data).slice(0, 400)}`
  );

  /*
   * ------------------------------------------------
   * 8. إنشاء BUY بنفس السعر
   * ------------------------------------------------
   */

  const buyOrder = await api(
    "/api/orders",
    {
      method: "POST",
      body: JSON.stringify({
        symbol: "BTCUSDT",
        side: "buy",
        type: "limit",
        price: 100,
        quantity: 1,
      }),
    },
    buyerCookie
  );

  test(
    "إنشاء أمر شراء BTCUSDT",
    buyOrder.status === 201 &&
      buyOrder.data?.success === true,
    `HTTP ${buyOrder.status} | ${JSON.stringify(buyOrder.data).slice(0, 400)}`
  );

  /*
   * ------------------------------------------------
   * 9. قراءة Order Book
   * ------------------------------------------------
   */

  const orderBook = await api(
    "/api/orderbook?symbol=BTCUSDT",
    {},
    buyerCookie
  );

  test(
    "Order Book بعد المطابقة",
    orderBook.status === 200 &&
      orderBook.data?.success === true
  );

  /*
   * ------------------------------------------------
   * 10. Trade History
   * ------------------------------------------------
   */

  const tradesBuyer = await api(
    "/api/trades?symbol=BTCUSDT",
    {},
    buyerCookie
  );

  const tradesSeller = await api(
    "/api/trades?symbol=BTCUSDT",
    {},
    sellerCookie
  );

  test(
    "Trade History للمشتري",
    tradesBuyer.status === 200 &&
      tradesBuyer.data?.success === true
  );

  test(
    "Trade History للبائع",
    tradesSeller.status === 200 &&
      tradesSeller.data?.success === true
  );

  const buyerTrades = tradesBuyer.data?.trades || [];
  const sellerTrades = tradesSeller.data?.trades || [];

  test(
    "وجود صفقة للمشتري",
    buyerTrades.length > 0
  );

  test(
    "وجود صفقة للبائع",
    sellerTrades.length > 0
  );

  /*
   * ------------------------------------------------
   * 11. قراءة المحافظ بعد التنفيذ
   * ------------------------------------------------
   */

  const afterBuyer = await api(
    "/api/wallet",
    {},
    buyerCookie
  );

  const afterSeller = await api(
    "/api/wallet",
    {},
    sellerCookie
  );

  test(
    "محفظة المشتري بعد التداول",
    afterBuyer.status === 200
  );

  test(
    "محفظة البائع بعد التداول",
    afterSeller.status === 200
  );

  const buyerSpot =
    afterBuyer.data?.wallets?.spot?.balances || [];

  const sellerSpot =
    afterSeller.data?.wallets?.spot?.balances || [];

  const buyerBTC = buyerSpot.find(
    (b: any) => b.asset === "BTC"
  );

  const buyerUSDT = buyerSpot.find(
    (b: any) => b.asset === "USDT"
  );

  const sellerBTC = sellerSpot.find(
    (b: any) => b.asset === "BTC"
  );

  const sellerUSDT = sellerSpot.find(
    (b: any) => b.asset === "USDT"
  );

  test(
    "إضافة BTC للمشتري",
    Number(buyerBTC?.available || 0) >= 1,
    `BTC=${buyerBTC?.available ?? 0}`
  );

  test(
    "إضافة USDT للبائع",
    Number(sellerUSDT?.available || 0) >= 100,
    `USDT=${sellerUSDT?.available ?? 0}`
  );

  test(
    "انخفاض BTC المتاح عند البائع",
    Number(sellerBTC?.available || 0) < 1,
    `BTC=${sellerBTC?.available ?? 0}`
  );

  /*
   * ------------------------------------------------
   * 12. Ledger
   * ------------------------------------------------
   */

  const buyerLedger = await api(
    "/api/account/ledger?asset=BTC",
    {},
    buyerCookie
  );

  const sellerLedger = await api(
    "/api/account/ledger?asset=USDT",
    {},
    sellerCookie
  );

  test(
    "Ledger للمشتري",
    buyerLedger.status === 200 &&
      buyerLedger.data?.success === true
  );

  test(
    "Ledger للبائع",
    sellerLedger.status === 200 &&
      sellerLedger.data?.success === true
  );

  /*
   * ------------------------------------------------
   * 13. Logout
   * ------------------------------------------------
   */

  const buyerLogout = await api(
    "/api/auth/logout",
    { method: "POST", body: "{}" },
    buyerCookie
  );

  test(
    "Logout المشتري",
    buyerLogout.status === 200
  );

  console.log("");
  console.log("==================================================");
  console.log("FINAL RESULT");
  console.log("==================================================");
  console.log(`PASS    : ${PASS}`);
  console.log(`FAIL    : ${FAIL}`);
  console.log("==================================================");

  if (FAIL > 0) {
    process.exit(1);
  }

  console.log("كل اختبارات التداول الأساسية نجحت.");
}

main().catch((error) => {
  console.error("");
  console.error("FATAL TEST ERROR:");
  console.error(error);
  process.exit(1);
});