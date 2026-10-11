const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { SignJWT } = require("jose");

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) throw new Error(".env.local غير موجود");

  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;

    const i = s.indexOf("=");
    const key = s.slice(0, i).trim();
    let value = s.slice(i + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function model(name, collection) {
  return (
    mongoose.models[name] ||
    mongoose.model(
      name,
      new mongoose.Schema({}, {
        strict: false,
        collection,
      })
    )
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(pathname, options = {}) {
  const response = await fetch(
    `http://127.0.0.1:3000${pathname}`,
    options
  );

  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return { response, data };
}

async function getBTCPrice() {
  const response = await fetch(
    "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
  );

  if (!response.ok) {
    throw new Error(`Binance HTTP ${response.status}`);
  }

  const data = await response.json();
  const price = Number(data?.price);

  assert(
    Number.isFinite(price) && price > 0,
    "سعر BTC غير صالح"
  );

  return price;
}

loadEnv();

const MONGODB_URI = process.env.MONGODB_URI;
const AUTH_SECRET = process.env.AUTH_SECRET;
const MONITOR_SECRET = process.env.MARGIN_MONITOR_SECRET;

assert(MONGODB_URI, "MONGODB_URI غير موجود");
assert(AUTH_SECRET, "AUTH_SECRET غير موجود");
assert(MONITOR_SECRET, "MARGIN_MONITOR_SECRET غير موجود");

const User = model("MarginFullE2EUserV2", "users");
const Kyc = model("MarginFullE2EKycV2", "kycrequests");
const Wallet = model("MarginFullE2EWalletV2", "wallets");
const Position = model("MarginFullE2EPositionV2", "marginpositions");
const Loan = model("MarginFullE2ELoanV2", "marginloans");
const Ledger = model("MarginFullE2ELedgerV2", "ledgerentries");
const Insurance = model("MarginFullE2EInsuranceV2", "insurancefunds");

const marker =
  `MARGIN-FULL-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

let userId = null;
let liqUserId = null;

let openedPositionId = null;
let liqPositionId = null;

let originalInsurance = null;

(async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("✅ MongoDB connected");

    // =====================================================
    // USER #1
    // =====================================================

    const user = await User.create({
      username: `${marker}-USER`,
      referralCode: `${marker}-REF`,
      email: `${marker}@local.test`,
      name: "Margin Full E2E",
      role: "user",
      testMarker: marker,
    });

    userId = user._id;

    await Kyc.create({
      userId,
      status: "approved",
      testMarker: marker,
    });

    await Wallet.create({
      userId,
      type: "spot",
      balances: [
        {
          asset: "USDT",
          available: 100,
          locked: 0,
        },
      ],
      testMarker: marker,
    });

    console.log("✅ User #1 created");
    console.log("✅ KYC approved");
    console.log("✅ Wallet funded: 100 USDT");

    // =====================================================
    // AUTH
    // =====================================================

    const token = await new SignJWT({
      userId: String(userId),
    })
      .setProtectedHeader({
        alg: "HS256",
      })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(
        new TextEncoder().encode(AUTH_SECRET)
      );

    const cookie =
      `arabtrade_session=${token}`;

    // =====================================================
    // OPEN
    // =====================================================

    const open = await api(
      "/api/margin/open",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify({
          symbol: "BTCUSDT",
          side: "long",
          margin: 1,
          leverage: 2,
        }),
      }
    );

    console.log("\n========== OPEN ==========");

    console.log(
      JSON.stringify(
        {
          status: open.response.status,
          success: open.data?.success,
          message: open.data?.message,
          positionId: open.data?.position?._id || null,
          loanId: open.data?.loan?._id || null,
          borrowed: open.data?.loan?.amount || null,
          interestRate:
            open.data?.loan?.interestRate ?? null,
        },
        null,
        2
      )
    );

    assert(
      open.response.status === 201 &&
      open.data?.success === true,
      open.data?.message || "Open failed"
    );

    openedPositionId =
      String(open.data.position._id);

    // =====================================================
    // VERIFY OPEN
    // =====================================================

    const walletOpen =
      await Wallet.findOne({
        userId,
        type: "spot",
      }).lean();

    const usdtOpen =
      walletOpen?.balances?.find(
        (x) =>
          String(x.asset).toUpperCase() === "USDT"
      );

    const positionOpen =
      await Position.findById(
        openedPositionId
      ).lean();

    const loanOpen =
      await Loan.findOne({
        userId,
        positionId:
          new mongoose.Types.ObjectId(
            openedPositionId
          ),
      }).lean();

    console.log(
      "\n========== VERIFY OPEN =========="
    );

    console.log(
      JSON.stringify(
        {
          walletUSDT:
            Number(usdtOpen?.available || 0),
          position:
            positionOpen
              ? {
                  status: positionOpen.status,
                  symbol: positionOpen.symbol,
                  side: positionOpen.side,
                  margin: positionOpen.margin,
                  borrowed: positionOpen.borrowed,
                }
              : null,
          loan:
            loanOpen
              ? {
                  status: loanOpen.status,
                  positionId:
                    String(loanOpen.positionId),
                  outstanding:
                    loanOpen.outstanding,
                  interestRate:
                    loanOpen.interestRate,
                }
              : null,
        },
        null,
        2
      )
    );

    assert(
      Number(usdtOpen?.available || 0) === 99,
      "Wallet بعد Open غير صحيح"
    );

    assert(
      positionOpen?.status === "open",
      "Position لم تُفتح"
    );

    assert(
      loanOpen?.status === "active",
      "Loan لم يُنشأ"
    );

    assert(
      String(loanOpen.positionId) ===
        openedPositionId,
      "Loan غير مرتبط بالPosition"
    );

    console.log("✅ OPEN VERIFIED");

    // =====================================================
    // CLOSE
    // =====================================================

    const close = await api(
      "/api/margin/close",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify({
          id: openedPositionId,
        }),
      }
    );

    console.log("\n========== CLOSE ==========");

    console.log(
      JSON.stringify(
        {
          status: close.response.status,
          success: close.data?.success,
          message: close.data?.message,
          pnl: close.data?.pnl ?? null,
          interest:
            close.data?.interest ?? null,
          settlement:
            close.data?.settlement ?? null,
          positionStatus:
            close.data?.position?.status ?? null,
        },
        null,
        2
      )
    );

    assert(
      close.response.status === 200 &&
      close.data?.success === true,
      close.data?.message || "Close failed"
    );

    // =====================================================
    // VERIFY CLOSE
    // =====================================================

    const positionClosed =
      await Position.findById(
        openedPositionId
      ).lean();

    const loanClosed =
      await Loan.findOne({
        userId,
        positionId:
          new mongoose.Types.ObjectId(
            openedPositionId
          ),
      }).lean();

    const walletClosed =
      await Wallet.findOne({
        userId,
        type: "spot",
      }).lean();

    const usdtClosed =
      walletClosed?.balances?.find(
        (x) =>
          String(x.asset).toUpperCase() === "USDT"
      );

    console.log(
      "\n========== VERIFY CLOSE =========="
    );

    console.log(
      JSON.stringify(
        {
          walletUSDT:
            Number(usdtClosed?.available || 0),
          positionStatus:
            positionClosed?.status || null,
          loanStatus:
            loanClosed?.status || null,
          loanOutstanding:
            Number(
              loanClosed?.outstanding || 0
            ),
        },
        null,
        2
      )
    );

    assert(
      positionClosed?.status === "closed",
      "Position لم تُغلق"
    );

    assert(
      !!loanClosed,
      "Loan اختفى بعد Close"
    );

    assert(
      loanClosed.status === "repaid",
      `Loan status = ${loanClosed.status}`
    );

    assert(
      Number(loanClosed.outstanding || 0) === 0,
      "Loan outstanding ليس صفرًا"
    );

    const expectedWallet =
      99 +
      Number(close.data?.settlement || 0);

    assert(
      Math.abs(
        Number(usdtClosed?.available || 0) -
          expectedWallet
      ) < 1e-8,
      "Wallet settlement غير صحيح"
    );

    console.log(
      "✅ CLOSE + LOAN REPAYMENT VERIFIED"
    );

    // =====================================================
    // USER LEDGER DIAGNOSTIC
    // =====================================================

    const userLedger =
      await Ledger.find({
        userId,
        referenceId: openedPositionId,
      })
        .sort({ createdAt: 1 })
        .lean();

    console.log(
      "\n========== USER LEDGER =========="
    );

    console.log(
      JSON.stringify(
        userLedger.map((x) => ({
          type: x.type,
          amount: x.amount,
          before: x.balanceBefore,
          after: x.balanceAfter,
          scope: x.scope,
        })),
        null,
        2
      )
    );

    if (userLedger.length === 0) {
      console.log(
        "⚠️ لا توجد Ledger entries للـOpen/Close."
      );
    } else {
      console.log(
        `✅ USER LEDGER ENTRIES = ${userLedger.length}`
      );
    }

    // =====================================================
    // USER #2 FOR LIQUIDATION
    // =====================================================

    const liqUser = await User.create({
      username: `${marker}-LIQ`,
      referralCode: `${marker}-LIQREF`,
      email: `${marker}-liq@local.test`,
      name: "Margin Liquidation E2E",
      role: "user",
      testMarker: marker,
    });

    liqUserId = liqUser._id;

    await Kyc.create({
      userId: liqUserId,
      status: "approved",
      testMarker: marker,
    });

    await Wallet.create({
      userId: liqUserId,
      type: "spot",
      balances: [
        {
          asset: "USDT",
          available: 10,
          locked: 0,
        },
      ],
      testMarker: marker,
    });

    console.log(
      "\n✅ User #2 created for liquidation"
    );

    // =====================================================
    // INSURANCE SNAPSHOT
    // =====================================================

    const oldFund =
      await Insurance.findOne({
        asset: "USDT",
      }).lean();

    originalInsurance =
      oldFund
        ? JSON.parse(JSON.stringify(oldFund))
        : null;

    await Insurance.findOneAndUpdate(
      {
        asset: "USDT",
      },
      {
        $setOnInsert: {
          asset: "USDT",
          totalFunded: 0,
          totalUsed: 0,
        },
        $set: {
          balance: 5,
        },
      },
      {
        upsert: true,
      }
    );

    console.log(
      "✅ Insurance Fund prepared = 5 USDT"
    );

    // =====================================================
    // SYNTHETIC POSITION
    // =====================================================

    const btc = await getBTCPrice();

    const syntheticEntry =
      btc * 10;

    const synthetic =
      await Position.create({
        userId: liqUserId,
        symbol: "BTCUSDT",
        side: "long",
        quantity: 1,
        entryPrice: syntheticEntry,
        markPrice: syntheticEntry,
        leverage: 2,
        margin: 1,
        borrowed: 2,
        interest: 0,
        pnl: 0,
        status: "open",
        testMarker: marker,
      });

    liqPositionId =
      String(synthetic._id);

    await Loan.create({
      userId: liqUserId,
      positionId: synthetic._id,
      asset: "USDT",
      amount: 2,
      outstanding: 2,
      interestRate: 0,
      accruedInterest: 0,
      badDebt: 0,
      status: "active",
      testMarker: marker,
    });

    console.log(
      "✅ Synthetic liquidation position created"
    );

    // =====================================================
    // MONITOR
    // =====================================================

    const monitor = await api(
      "/api/margin/monitor",
      {
        method: "POST",
        headers: {
          "x-margin-monitor-secret":
            MONITOR_SECRET,
        },
      }
    );

    console.log(
      "\n========== MONITOR =========="
    );

    console.log(
      JSON.stringify(
        {
          status: monitor.response.status,
          success: monitor.data?.success,
          checked: monitor.data?.checked,
          liquidated:
            monitor.data?.liquidated,
          insuranceUsed:
            monitor.data?.insuranceUsed,
          badDebt:
            monitor.data?.badDebt,
        },
        null,
        2
      )
    );

    assert(
      monitor.response.status === 200 &&
      monitor.data?.success === true,
      monitor.data?.message ||
        "Monitor failed"
    );

    // =====================================================
    // VERIFY LIQUIDATION
    // =====================================================

    const finalPosition =
      await Position.findById(
        liqPositionId
      ).lean();

    const finalLoan =
      await Loan.findOne({
        positionId:
          new mongoose.Types.ObjectId(
            liqPositionId
          ),
      }).lean();

    const finalFund =
      await Insurance.findOne({
        asset: "USDT",
      }).lean();

    const systemLedger =
      await Ledger.find({
        scope: "system",
        referenceId: liqPositionId,
      })
        .sort({ createdAt: 1 })
        .lean();

    console.log(
      "\n========== VERIFY LIQUIDATION =========="
    );

    console.log(
      JSON.stringify(
        {
          positionStatus:
            finalPosition?.status || null,
          loanStatus:
            finalLoan?.status || null,
          loanBadDebt:
            Number(finalLoan?.badDebt || 0),
          insuranceBalance:
            Number(finalFund?.balance || 0),
          systemLedger:
            systemLedger.map((x) => ({
              type: x.type,
              amount: x.amount,
              before: x.balanceBefore,
              after: x.balanceAfter,
              account: x.systemAccount,
            })),
        },
        null,
        2
      )
    );

    assert(
      finalPosition?.status === "liquidated",
      "Position لم تتم تصفيتها"
    );

    assert(
      finalLoan?.status === "liquidated",
      "Loan لم تتم تصفيته"
    );

    const insuranceCredit =
      systemLedger.filter(
        (x) =>
          x.type ===
          "insurance_fund_credit"
      );

    const insuranceDebit =
      systemLedger.filter(
        (x) =>
          x.type ===
          "insurance_fund_debit"
      );

    const badDebtEntries =
      systemLedger.filter(
        (x) =>
          x.type === "bad_debt"
      );

    console.log(
      "\n========== INSURANCE / BAD DEBT =========="
    );

    console.log(
      JSON.stringify(
        {
          insuranceCredit:
            insuranceCredit.map((x) => x.amount),
          insuranceDebit:
            insuranceDebit.map((x) => x.amount),
          badDebt:
            badDebtEntries.map((x) => x.amount),
          apiInsuranceUsed:
            monitor.data?.insuranceUsed ?? 0,
          apiBadDebt:
            monitor.data?.badDebt ?? 0,
        },
        null,
        2
      )
    );

    if (
      insuranceDebit.length > 0 &&
      Number(monitor.data?.insuranceUsed || 0) > 0
    ) {
      console.log(
        "✅ INSURANCE FUND WAS USED"
      );
    } else {
      console.log(
        "⚠️ التصفية تمت، لكن لم يتم استخدام Insurance Fund في هذا السيناريو."
      );
    }

    if (badDebtEntries.length > 0) {
      console.log(
        "✅ BAD DEBT WAS RECORDED"
      );
    } else {
      console.log(
        "⚠️ لم يتم تسجيل Bad Debt في هذا السيناريو."
      );
    }

    console.log(
      "\n✅✅ FULL MARGIN E2E COMPLETED"
    );

  } catch (error) {
    console.error(
      "\n❌ FULL E2E FAILED:",
      error instanceof Error
        ? error.message
        : error
    );

    process.exitCode = 1;

  } finally {
    // =====================================================
    // CLEANUP
    // =====================================================

    try {
      if (userId) {
        await Kyc.deleteMany({
          userId,
          testMarker: marker,
        });

        await Wallet.deleteMany({
          userId,
          testMarker: marker,
        });

        await Position.deleteMany({
          userId,
          testMarker: marker,
        });

        await Loan.deleteMany({
          userId,
          testMarker: marker,
        });

        await User.deleteMany({
          _id: userId,
          testMarker: marker,
        });
      }

      if (liqUserId) {
        await Kyc.deleteMany({
          userId: liqUserId,
          testMarker: marker,
        });

        await Wallet.deleteMany({
          userId: liqUserId,
          testMarker: marker,
        });

        await Position.deleteMany({
          userId: liqUserId,
          testMarker: marker,
        });

        await Loan.deleteMany({
          userId: liqUserId,
          testMarker: marker,
        });

        await User.deleteMany({
          _id: liqUserId,
          testMarker: marker,
        });
      }

      await Ledger.deleteMany({
        referenceId: {
          $in: [
            openedPositionId,
            liqPositionId,
          ].filter(Boolean),
        },
      });

      if (originalInsurance) {
        await Insurance.replaceOne(
          { _id: originalInsurance._id },
          originalInsurance
        );
      } else {
        await Insurance.deleteOne({
          asset: "USDT",
        });
      }

      console.log(
        "🧹 ALL TEST DATA CLEANED"
      );

    } catch (cleanupError) {
      console.error(
        "⚠️ CLEANUP ERROR:",
        cleanupError instanceof Error
          ? cleanupError.message
          : cleanupError
      );
    }

    try {
      await mongoose.disconnect();
    } catch {}
  }
})();
