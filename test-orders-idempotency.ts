import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  // مهم: نعمل imports للمشروع AFTER loadEnvConfig
  const mongoose = await import("mongoose");
  const { NextRequest } = await import("next/server");

  const { connectDB } =
    await import("@/lib/mongodb");

  const User =
    (await import("@/models/User")).default;

  const Wallet =
    (await import("@/models/Wallet")).default;

  const Asset =
    (await import("@/models/Asset")).default;

  const Order =
    (await import("@/models/Order")).default;

  const IdempotencyKey =
    (await import("@/models/IdempotencyKey")).default;

  const { POST } =
    await import("@/app/api/orders/route");

  const { SignJWT } =
    await import("jose");

  await connectDB();

  // تهيئة PlatformSettings مرة واحدة قبل اختبار الـ concurrency
  const { getPlatformSettings } =
    await import("@/lib/platform-settings");

  await getPlatformSettings();

  const suffix = Date.now();

  // ------------------------------------------------------
  // 1) Test user
  // ------------------------------------------------------
  const user =
    await User.create({
      name: "Idempotency Test",
      username: `idem${suffix}`,
      email: `idem-${suffix}@example.com`,
      password: "Test123456",
      referralCode: `IDEM${suffix}`,
      role: "user",
      isActive: true,
    });

  // ------------------------------------------------------
  // 2) Assets
  // ------------------------------------------------------
  await Asset.findOneAndUpdate(
    { symbol: "BTC" },
    {
      $set: {
        name: "Bitcoin",
        symbol: "BTC",
        type: "crypto",
        enabled: true,
        depositEnabled: false,
        withdrawalEnabled: false,
        tradingEnabled: true,
        networks: [],
      },
    },
    {
      upsert: true,
      returnDocument: "after",
    }
  );

  await Asset.findOneAndUpdate(
    { symbol: "USDT" },
    {
      $set: {
        name: "Tether",
        symbol: "USDT",
        type: "crypto",
        enabled: true,
        depositEnabled: false,
        withdrawalEnabled: false,
        tradingEnabled: true,
        networks: [],
      },
    },
    {
      upsert: true,
      returnDocument: "after",
    }
  );

  // ------------------------------------------------------
  // 3) Demo wallet
  // ------------------------------------------------------
  await Wallet.create({
    userId: user._id,
    type: "spot",
    mode: "demo",
    balances: [
      {
        asset: "USDT",
        available: 1000,
        locked: 0,
      },
      {
        asset: "BTC",
        available: 0,
        locked: 0,
      },
    ],
  });

  // ------------------------------------------------------
  // 4) JWT
  // ------------------------------------------------------
  const secretText =
    process.env.AUTH_SECRET;

  if (!secretText) {
    throw new Error(
      "AUTH_SECRET is not configured"
    );
  }

  const secret =
    new TextEncoder().encode(
      secretText
    );

  const token =
    await new SignJWT({
      userId: String(user._id),
    })
      .setProtectedHeader({
        alg: "HS256",
        typ: "JWT",
      })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(secret);

  // ------------------------------------------------------
  // 5) Same request + same idempotency key
  // ------------------------------------------------------
  const requestBody = {
    symbol: "BTCUSDT",
    mode: "demo",
    side: "buy",
    type: "limit",
    price: 1000,
    quantity: 0.01,
  };

  const idempotencyKey =
    `idem-concurrency-${suffix}`;

  function makeRequest() {
    return new NextRequest(
      "http://localhost/api/orders",
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
          "cookie":
            `arabtrade_session=${token}`,
          "Idempotency-Key":
            idempotencyKey,
        },
        body: JSON.stringify(
          requestBody
        ),
      }
    );
  }

  console.log("");
  console.log(
    "===== IDEMPOTENCY CONCURRENCY TEST ====="
  );
  console.log(
    "User:",
    String(user._id)
  );
  console.log(
    "Key:",
    idempotencyKey
  );

  // ------------------------------------------------------
  // 6) Two simultaneous API calls
  // ------------------------------------------------------
  const [response1, response2] =
    await Promise.all([
      POST(makeRequest()),
      POST(makeRequest()),
    ]);

  const result1 =
    await response1.json();

  const result2 =
    await response2.json();

  console.log("");
  console.log(
    "Response 1 status:",
    response1.status
  );
  console.dir(result1, {
    depth: 5,
  });

  console.log("");
  console.log(
    "Response 2 status:",
    response2.status
  );
  console.dir(result2, {
    depth: 5,
  });

  // ------------------------------------------------------
  // 7) DB verification
  // ------------------------------------------------------
  const orders =
    await Order.find({
      userId: user._id,
      mode: "demo",
      symbol: "BTCUSDT",
    })
      .sort({ createdAt: 1 })
      .lean();

  const keys =
    await IdempotencyKey.find({
      userId: user._id,
      route: "/api/orders",
      key: idempotencyKey,
    }).lean();

  const wallet =
    await Wallet.findOne({
      userId: user._id,
      type: "spot",
      mode: "demo",
    }).lean();

  const usdt =
    wallet?.balances?.find(
      (x: any) =>
        x.asset === "USDT"
    );

  console.log("");
  console.log(
    "Orders created:",
    orders.length
  );
  console.log(
    "Idempotency records:",
    keys.length
  );
  console.log(
    "USDT available:",
    usdt?.available
  );
  console.log(
    "USDT locked:",
    usdt?.locked
  );

  const sameOrder =
    result1?.order?._id &&
    result2?.order?._id &&
    String(
      result1.order._id
    ) ===
      String(
        result2.order._id
      );

  const oneOrder =
    orders.length === 1;

  const oneKey =
    keys.length === 1;

  const correctLock =
    Number(usdt?.available) ===
      990 &&
    Number(usdt?.locked) ===
      10;

  console.log("");

  if (
    oneOrder &&
    oneKey &&
    sameOrder &&
    correctLock
  ) {
    console.log(
      "✅ IDEMPOTENCY CONCURRENCY TEST PASSED"
    );
    console.log(
      "✅ Only ONE order was created"
    );
    console.log(
      "✅ Both requests returned the SAME order"
    );
    console.log(
      "✅ Only ONE idempotency record exists"
    );
    console.log(
      "✅ Balance was locked only ONCE"
    );
  } else {
    console.log(
      "❌ IDEMPOTENCY CONCURRENCY TEST FAILED"
    );
    console.log(
      "sameOrder:",
      sameOrder
    );
    console.log(
      "oneOrder:",
      oneOrder
    );
    console.log(
      "oneKey:",
      oneKey
    );
    console.log(
      "correctLock:",
      correctLock
    );
  }

  // ------------------------------------------------------
  // 8) Cleanup
  // ------------------------------------------------------
  await IdempotencyKey.deleteMany({
    userId: user._id,
  });

  await Order.deleteMany({
    userId: user._id,
  });

  await Wallet.deleteMany({
    userId: user._id,
  });

  await User.deleteOne({
    _id: user._id,
  });

  await mongoose.disconnect();

  if (
    !oneOrder ||
    !oneKey ||
    !sameOrder ||
    !correctLock
  ) {
    process.exit(1);
  }
}

main().catch(
  async (error) => {
    console.error(
      "❌ TEST ERROR:",
      error
    );

    try {
      const mongoose =
        await import("mongoose");
      await mongoose.disconnect();
    } catch {}

    process.exit(1);
  }
);
