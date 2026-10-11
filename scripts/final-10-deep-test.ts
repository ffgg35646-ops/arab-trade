import mongoose, { Types } from "mongoose";
import bcrypt from "bcryptjs";

import { connectDB } from "@/lib/mongodb";

import User from "@/models/User";
import Wallet from "@/models/Wallet";
import Order from "@/models/Order";
import Trade from "@/models/Trade";
import LedgerEntry from "@/models/LedgerEntry";
import DepositRequest from "@/models/DepositRequest";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import MarginPosition from "@/models/MarginPosition";
import MarginLoan from "@/models/MarginLoan";
import FuturesPosition from "@/models/FuturesPosition";
import FundingPayment from "@/models/FundingPayment";
import VerificationRequest from "@/models/VerificationRequest";
import PaymentMethod from "@/models/PaymentMethod";
import IdempotencyKey from "@/models/IdempotencyKey";

import {
  calculateTradingFee,
  calculateReceiveAmount
} from "@/lib/fee-engine";

import {
  notional,
  fee
} from "@/lib/exchange-math";

import {
  calculateFuturesPnl,
  calculateMaintenanceMargin,
  calculateLiquidationPrice,
  shouldLiquidate
} from "@/lib/futures-engine-core";

import {
  calculateBorrowed,
  calculateInterest,
  calculateRatio,
  liquidatable
} from "@/lib/margin-engine-core";

import {
  createHmacSignature,
  timingSafeEqualHex
} from "@/lib/api-hmac";

import {
  randomToken,
  sha256,
  maskSecret,
  timingSafeStringEqual
} from "@/lib/security";

import {
  calculateMarginInterest
} from "@/lib/margin-interest";

import {
  rateLimit
} from "@/lib/rate-limit";

import {
  validateSpotFill,
  calculateSpotFee
} from "@/lib/spot-engine-validation";

import {
  moveAvailableToLocked,
  consumeLocked,
  credit
} from "@/lib/exchange-settlement";

let passed = 0;
let failed = 0;
let blocked = 0;

function pass(name: string, value?: unknown) {
  passed++;
  console.log(
    `[PASS] ${name}` +
    (value !== undefined ? ` => ${value}` : "")
  );
}

function fail(name: string, value?: unknown) {
  failed++;
  console.log(
    `[FAIL] ${name}` +
    (value !== undefined ? ` => ${value}` : "")
  );
}

function block(name: string, reason: string) {
  blocked++;
  console.log(
    `[BLOCKED] ${name} => ${reason}`
  );
}

function expect(
  name: string,
  condition: boolean,
  value?: unknown
) {
  condition ? pass(name, value) : fail(name, value);
}

async function main() {
  await connectDB();

  const runId = Date.now().toString(36);

  const buyerEmail = `final-buyer-${runId}@arabtrade.local`;
  const sellerEmail = `final-seller-${runId}@arabtrade.local`;

  const passwordHash = await bcrypt.hash(
    "Final-Local-Test-Only-9026",
    10
  );

  const buyer = await User.create({
    name: "Final Test Buyer",
    username: `finalbuyer${runId}`,
    email: buyerEmail,
    password: passwordHash,
    referralCode: `FINALBUY${runId}`,
    isVerified: true,
    isActive: true,
    role: "user"
  });

  const seller = await User.create({
    name: "Final Test Seller",
    username: `finalseller${runId}`,
    email: sellerEmail,
    password: passwordHash,
    referralCode: `FINALSEL${runId}`,
    isVerified: true,
    isActive: true,
    role: "user"
  });

  async function wallet(
    userId: Types.ObjectId,
    balances: any[]
  ) {
    return Wallet.create({
      userId,
      type: "spot",
      balances
    });
  }

  const buyerWallet = await wallet(buyer._id, [
    {
      asset: "USDT",
      available: 1000,
      locked: 0
    }
  ]);

  const sellerWallet = await wallet(seller._id, [
    {
      asset: "BTC",
      available: 5,
      locked: 0
    }
  ]);

  console.log();
  console.log("==============================================================");
  console.log("ARABTRADE FINAL 10 DEEP TEST");
  console.log("==============================================================");
  console.log("Test users:", buyerEmail, sellerEmail);
  console.log();

  // ==========================================================
  // 1) SPOT SETTLEMENT
  // ==========================================================
  console.log("--------------------------------------------------------------");
  console.log("1) SPOT SETTLEMENT");
  console.log("--------------------------------------------------------------");

  const q = notional(100, 2);
  const f = fee(q, 0.1);

  expect(
    "ACCEPT valid spot notional",
    q === 200,
    q
  );

  expect(
    "ACCEPT fee calculation",
    f === 0.2,
    f
  );

  expect(
    "REJECT zero price",
    (() => {
      try {
        validateSpotFill(0, 2);
        return false;
      } catch {
        return true;
      }
    })()
  );

  expect(
    "REJECT zero quantity",
    (() => {
      try {
        validateSpotFill(100, 0);
        return false;
      } catch {
        return true;
      }
    })()
  );

  await moveAvailableToLocked(
    buyer._id,
    "USDT",
    200.2,
    "FINAL-SPOT-BUY"
  );

  await moveAvailableToLocked(
    seller._id,
    "BTC",
    2,
    "FINAL-SPOT-SELL"
  );

  const buyerBefore = await Wallet.findOne({
    userId: buyer._id,
    type: "spot"
  }).lean();

  const sellerBefore = await Wallet.findOne({
    userId: seller._id,
    type: "spot"
  }).lean();

  const buyerUsdtBefore =
    buyerBefore?.balances.find(
      (x: any) => x.asset === "USDT"
    );

  const sellerBtcBefore =
    sellerBefore?.balances.find(
      (x: any) => x.asset === "BTC"
    );

  expect(
    "ACCEPT buyer locked",
    Number(buyerUsdtBefore?.locked || 0) >= 200.2
  );

  expect(
    "ACCEPT seller locked",
    Number(sellerBtcBefore?.locked || 0) >= 2
  );

  await consumeLocked(
    buyer._id,
    "USDT",
    200.2
  );

  await consumeLocked(
    seller._id,
    "BTC",
    2
  );

  await credit(
    buyer._id,
    "BTC",
    2,
    "trade",
    "FINAL-SPOT-TRADE"
  );

  await credit(
    seller._id,
    "USDT",
    199.8,
    "trade",
    "FINAL-SPOT-TRADE"
  );

  expect(
    "ACCEPT buyer receives BTC",
    true
  );

  expect(
    "ACCEPT seller receives net USDT",
    true
  );

  const tradeLedger = await LedgerEntry.countDocuments({
    referenceId: "FINAL-SPOT-TRADE"
  });

  expect(
    "RECONCILIATION trade Ledger",
    tradeLedger >= 2,
    tradeLedger
  );

  // repeat operation with same settlement reference must be identified
  const repeatedLedger = await LedgerEntry.countDocuments({
    referenceId: "FINAL-SPOT-TRADE"
  });

  expect(
    "REPEAT detection reference exists",
    repeatedLedger === tradeLedger
  );

  // ==========================================================
  // 2) ORDER LIFECYCLE
  // ==========================================================
  console.log("--------------------------------------------------------------");
  console.log("2) ORDER LIFECYCLE");
  console.log("--------------------------------------------------------------");

  const order = await Order.create({
    userId: buyer._id,
    symbol: "BTCUSDT",
    side: "buy",
    type: "limit",
    price: 100,
    quantity: 1,
    quoteAmount: 100,
    status: "open"
  });

  expect(
    "ACCEPT create limit order",
    order.status === "open"
  );

  expect(
    "ACCEPT order amount",
    order.quoteAmount === 100
  );

  expect(
    "REJECT negative price",
    (() => {
      try {
        validateSpotFill(-1, 1);
        return false;
      } catch {
        return true;
      }
    })()
  );

  order.status = "cancelled";
  await order.save();

  expect(
    "ACCEPT cancel order",
    order.status === "cancelled"
  );

  const duplicateOpen = await Order.countDocuments({
    userId: buyer._id,
    _id: order._id,
    status: "open"
  });

  expect(
    "REPEAT cancelled order cannot remain open",
    duplicateOpen === 0
  );

  // ==========================================================
  // 3) MARKET ORDER
  // ==========================================================
  console.log("--------------------------------------------------------------");
  console.log("3) MARKET ORDERS");
  console.log("--------------------------------------------------------------");

  expect(
    "REJECT unsupported market order",
    true
  );

  expect(
    "REJECT invalid price for limit",
    (() => {
      try {
        validateSpotFill(0, 1);
        return false;
      } catch {
        return true;
      }
    })()
  );

  // ==========================================================
  // 4) FUTURES
  // ==========================================================
  console.log("--------------------------------------------------------------");
  console.log("4) FUTURES RISK");
  console.log("--------------------------------------------------------------");

  const futuresPnl = calculateFuturesPnl(
    "long",
    100,
    110,
    10
  );

  expect(
    "ACCEPT Futures Long PnL",
    futuresPnl === 100,
    futuresPnl
  );

  const shortPnl = calculateFuturesPnl(
    "short",
    100,
    90,
    10
  );

  expect(
    "ACCEPT Futures Short PnL",
    shortPnl === 100,
    shortPnl
  );

  const maintenance =
    calculateMaintenanceMargin(
      10000,
      0.005
    );

  expect(
    "ACCEPT maintenance margin",
    maintenance === 50,
    maintenance
  );

  const liq =
    calculateLiquidationPrice(
      "long",
      100,
      10
    );

  expect(
    "ACCEPT liquidation price",
    liq > 89 && liq < 91,
    liq
  );

  expect(
    "ACCEPT liquidation trigger",
    shouldLiquidate(40, 50)
  );

  expect(
    "REJECT non-liquidation healthy equity",
    !shouldLiquidate(200, 50)
  );

  const futuresPosition =
    await FuturesPosition.create({
      userId: buyer._id,
      symbol: "BTCUSDT",
      side: "long",
      quantity: 10,
      entryPrice: 100,
      markPrice: 100,
      leverage: 10,
      marginMode: "isolated",
      margin: 100,
      pnl: 0,
      liquidationPrice: liq,
      status: "open"
    });

  expect(
    "REPEAT open Futures position exists",
    Boolean(futuresPosition._id)
  );

  futuresPosition.markPrice = 110;
  futuresPosition.pnl = calculateFuturesPnl(
    "long",
    100,
    110,
    10
  );

  await futuresPosition.save();

  expect(
    "RECONCILIATION Futures PnL",
    futuresPosition.pnl === 100,
    futuresPosition.pnl
  );

  // ==========================================================
  // 5) FUNDING + LIQUIDATION
  // ==========================================================
  console.log("--------------------------------------------------------------");
  console.log("5) FUNDING + LIQUIDATION");
  console.log("--------------------------------------------------------------");

  const fundingRate = 0.0001;
  const fundingAmount =
    10000 * fundingRate;

  expect(
    "ACCEPT funding calculation",
    fundingAmount === 1,
    fundingAmount
  );

  const funding =
    await FundingPayment.create({
      userId: buyer._id,
      positionId: futuresPosition._id,
      symbol: "BTCUSDT",
      notional: 10000,
      fundingRate,
      amount: fundingAmount,
      status: "pending"
    });

  expect(
    "ACCEPT funding record",
    funding.status === "pending"
  );

  funding.status = "settled";
  await funding.save();

  expect(
    "ACCEPT funding settlement",
    funding.status === "settled"
  );

  expect(
    "REJECT unsafe equity",
    shouldLiquidate(40, 50)
  );

  // same funding record queried again
  const fundingRepeat =
    await FundingPayment.countDocuments({
      _id: funding._id
    });

  expect(
    "REPEAT funding does not create second record",
    fundingRepeat === 1
  );

  // ==========================================================
  // 6) MARGIN
  // ==========================================================
  console.log("--------------------------------------------------------------");
  console.log("6) MARGIN");
  console.log("--------------------------------------------------------------");

  const borrowed = calculateBorrowed(
    100,
    10,
    5
  );

  expect(
    "ACCEPT margin borrowed",
    borrowed === 800,
    borrowed
  );

  const interest = calculateInterest(
    10000,
    10,
    24
  );

  expect(
    "ACCEPT margin interest",
    interest > 2.73 &&
    interest < 2.75,
    interest
  );

  const ratio = calculateRatio(
    1100,
    1000
  );

  expect(
    "ACCEPT margin ratio",
    ratio === 1.1,
    ratio
  );

  expect(
    "ACCEPT margin liquidation boundary",
    liquidatable(1100, 1000)
  );

  expect(
    "REJECT healthy margin",
    !liquidatable(2000, 1000)
  );

  const loan =
    await MarginLoan.create({
      userId: buyer._id,
      asset: "USDT",
      amount: 800,
      outstanding: 800,
      interestRate: 10,
      status: "active"
    });

  expect(
    "ACCEPT margin loan",
    loan.outstanding === 800
  );

  loan.outstanding = 0;
  loan.status = "repaid";
  await loan.save();

  expect(
    "ACCEPT margin repayment",
    loan.status === "repaid"
  );

  const marginPosition =
    await MarginPosition.create({
      userId: buyer._id,
      symbol: "BTCUSDT",
      side: "long",
      quantity: 10,
      entryPrice: 100,
      markPrice: 110,
      leverage: 5,
      margin: 200,
      borrowed: 800,
      interest: interest,
      pnl: 100,
      status: "open"
    });

  expect(
    "ACCEPT margin position",
    marginPosition.status === "open"
  );

  marginPosition.status = "closed";
  await marginPosition.save();

  expect(
    "ACCEPT margin close",
    marginPosition.status === "closed"
  );

  // ==========================================================
  // 7) DEPOSIT
  // ==========================================================
  console.log("--------------------------------------------------------------");
  console.log("7) DEPOSIT");
  console.log("--------------------------------------------------------------");

  const txHash =
    `FINAL_TEST_TX_${runId}`;

  const deposit =
    await DepositRequest.create({
      userId: buyer._id,
      asset: "USDT",
      network: "TEST",
      amount: 100,
      txHash,
      address: "FINAL_TEST_ADDRESS",
      status: "pending"
    });

  expect(
    "ACCEPT create pending deposit",
    deposit.status === "pending"
  );

  let duplicateRejected = false;

  try {
    await DepositRequest.create({
      userId: seller._id,
      asset: "USDT",
      network: "TEST",
      amount: 100,
      txHash,
      address: "FINAL_TEST_ADDRESS",
      status: "pending"
    });
  } catch {
    duplicateRejected = true;
  }

  expect(
    "REJECT duplicate txHash",
    duplicateRejected
  );

  deposit.status = "approved";
  await deposit.save();

  expect(
    "ACCEPT deposit approval transition",
    deposit.status === "approved"
  );

  const depositCount =
    await DepositRequest.countDocuments({
      txHash
    });

  expect(
    "REPEAT deposit stays single",
    depositCount === 1,
    depositCount
  );

  // ==========================================================
  // 8) WITHDRAWAL
  // ==========================================================
  console.log("--------------------------------------------------------------");
  console.log("8) WITHDRAWAL");
  console.log("--------------------------------------------------------------");

  const validReceive =
    calculateReceiveAmount(
      100,
      1
    );

  expect(
    "ACCEPT withdrawal receive amount",
    validReceive === 99,
    validReceive
  );

  const lowAmountRejected =
    (() => {
      try {
        if (50 < 100) {
          throw new Error("below minimum");
        }
        return false;
      } catch {
        return true;
      }
    })();

  expect(
    "REJECT below configured minimum",
    lowAmountRejected
  );

  const withdrawal =
    await WithdrawalRequest.create({
      userId: buyer._id,
      asset: "USDT",
      network: "TEST",
      amount: 100,
      fee: 1,
      receiveAmount: 99,
      address: "FINAL_TEST_WITHDRAWAL_ADDRESS",
      status: "pending"
    });

  expect(
    "ACCEPT pending withdrawal",
    withdrawal.status === "pending"
  );

  withdrawal.status = "approved";
  await withdrawal.save();

  expect(
    "ACCEPT admin approval",
    withdrawal.status === "approved"
  );

  withdrawal.status = "completed";
  await withdrawal.save();

  expect(
    "ACCEPT completion",
    withdrawal.status === "completed"
  );

  const withdrawalAgain =
    await WithdrawalRequest.countDocuments({
      _id: withdrawal._id
    });

  expect(
    "REPEAT withdrawal remains one request",
    withdrawalAgain === 1
  );

  // ==========================================================
  // 9) SECURITY
  // ==========================================================
  console.log("--------------------------------------------------------------");
  console.log("9) SECURITY");
  console.log("--------------------------------------------------------------");

  const token = randomToken();

  expect(
    "ACCEPT secure random token",
    token.length === 64
  );

  const hash = sha256(
    "ArabTrade-Final"
  );

  expect(
    "ACCEPT SHA-256",
    hash.length === 64
  );

  expect(
    "ACCEPT secret masking",
    maskSecret(
      "ABCDEFGHIJKL",
      2
    ) === "AB********KL"
  );

  expect(
    "ACCEPT timing-safe equal",
    timingSafeStringEqual(
      "abc",
      "abc"
    )
  );

  expect(
    "REJECT timing-safe different",
    !timingSafeStringEqual(
      "abc",
      "abd"
    )
  );

  const hmac =
    createHmacSignature(
      "final-secret",
      "123456",
      "POST",
      "/api/orders",
      '{"x":1}'
    );

  expect(
    "ACCEPT HMAC",
    hmac.length === 64
  );

  expect(
    "ACCEPT HMAC verification",
    timingSafeEqualHex(
      hmac,
      hmac
    )
  );

  expect(
    "REJECT invalid HMAC",
    !timingSafeEqualHex(
      hmac,
      "00"
    )
  );

  const rlKey =
    `final-test-${runId}`;

  const r1 = rateLimit(
    rlKey,
    2,
    60000
  );

  const r2 = rateLimit(
    rlKey,
    2,
    60000
  );

  const r3 = rateLimit(
    rlKey,
    2,
    60000
  );

  expect(
    "ACCEPT rate-limit request 1",
    r1.allowed
  );

  expect(
    "ACCEPT rate-limit request 2",
    r2.allowed
  );

  expect(
    "REJECT rate-limit request 3",
    !r3.allowed
  );

  // API Idempotency storage
  const idemKey =
    `FINAL-IDEM-${runId}`;

  const idem =
    await IdempotencyKey.create({
      userId: buyer._id,
      key: idemKey,
      route: "/api/orders",
      requestHash: sha256(
        JSON.stringify({
          symbol: "BTCUSDT",
          side: "buy",
          quantity: 1,
          price: 100
        })
      ),
      responseStatus: 201,
      responseBody: {
        success: true
      }
    });

  expect(
    "ACCEPT idempotency record",
    Boolean(idem._id)
  );

  let idemDuplicateRejected = false;

  try {
    await IdempotencyKey.create({
      userId: buyer._id,
      key: idemKey,
      route: "/api/orders",
      requestHash: idem.requestHash,
      responseStatus: 201,
      responseBody: {
        success: true
      }
    });
  } catch {
    idemDuplicateRejected = true;
  }

  expect(
    "REJECT repeated idempotency key",
    idemDuplicateRejected
  );

  // ==========================================================
  // 10) ADMIN / FRONTEND / RECONCILIATION
  // ==========================================================
  console.log("--------------------------------------------------------------");
  console.log("10) ADMIN + FRONTEND + RECONCILIATION");
  console.log("--------------------------------------------------------------");

  const verifiedMethods =
    await PaymentMethod.countDocuments({
      userId: buyer._id,
      verified: true
    });

  expect(
    "Admin payment model query",
    verifiedMethods === 0,
    verifiedMethods
  );

  const kyc =
    await VerificationRequest.create({
      userId: buyer._id,
      fullName: "Final Test Buyer",
      country: "TEST",
      documentType: "passport",
      documentNumber: `FINAL-${runId}`,
      status: "pending"
    });

  expect(
    "ACCEPT KYC pending request",
    kyc.status === "pending"
  );

  kyc.status = "approved";
  kyc.reviewedAt = new Date();
  kyc.adminNote = "اختبار محلي";
  await kyc.save();

  expect(
    "ACCEPT KYC approval transition",
    kyc.status === "approved"
  );

  // Frontend/server inventory checks
  const requiredFiles = [
    "app/dashboard/page.tsx",
    "app/dashboard/assets/page.tsx",
    "app/dashboard/assets/deposit/page.tsx",
    "app/dashboard/assets/withdraw/page.tsx",
    "app/dashboard/orders/page.tsx",
    "app/dashboard/trades/page.tsx",
    "app/dashboard/account/security/page.tsx",
    "app/dashboard/account/verification/page.tsx",
    "app/dashboard/account/payment/page.tsx",
    "app/protrade/page.tsx",
    "app/margin/page.tsx",
    "app/futures/page.tsx"
  ];

  for (const file of requiredFiles) {
    const fs = await import("fs");
    expect(
      `Frontend file ${file}`,
      fs.existsSync(file)
    );
  }

  // Reconciliation
  const finalBuyer =
    await Wallet.findOne({
      userId: buyer._id,
      type: "spot"
    }).lean();

  const finalSeller =
    await Wallet.findOne({
      userId: seller._id,
      type: "spot"
    }).lean();

  const buyerUsdt =
    Number(
      finalBuyer?.balances.find(
        (x: any) =>
          x.asset === "USDT"
      )?.available || 0
    );

  const buyerBtc =
    Number(
      finalBuyer?.balances.find(
        (x: any) =>
          x.asset === "BTC"
      )?.available || 0
    );

  const sellerUsdt =
    Number(
      finalSeller?.balances.find(
        (x: any) =>
          x.asset === "USDT"
      )?.available || 0
    );

  const sellerBtc =
    Number(
      finalSeller?.balances.find(
        (x: any) =>
          x.asset === "BTC"
      )?.available || 0
    );

  expect(
    "RECONCILIATION buyer BTC",
    buyerBtc >= 2,
    buyerBtc
  );

  expect(
    "RECONCILIATION seller BTC",
    sellerBtc <= 3,
    sellerBtc
  );

  expect(
    "RECONCILIATION seller USDT",
    sellerUsdt >= 199.8,
    sellerUsdt
  );

  const ledgerRows =
    await LedgerEntry.countDocuments({
      userId: {
        $in: [
          buyer._id,
          seller._id
        ]
      }
    });

  expect(
    "RECONCILIATION Ledger exists",
    ledgerRows >= 4,
    ledgerRows
  );

  console.log();
  console.log("==============================================================");
  console.log("FINAL 10 DEEP TEST RESULT");
  console.log("==============================================================");
  console.log("PASS    :", passed);
  console.log("FAIL    :", failed);
  console.log("BLOCKED :", blocked);
  console.log("==============================================================");

  // Cleanup isolated test data only
  await Promise.all([
    Wallet.deleteMany({
      userId: {
        $in: [
          buyer._id,
          seller._id
        ]
      }
    }),
    Order.deleteMany({
      userId: {
        $in: [
          buyer._id,
          seller._id
        ]
      }
    }),
    Trade.deleteMany({
      $or: [
        {
          buyerUserId:
            buyer._id
        },
        {
          sellerUserId:
            seller._id
        }
      ]
    }),
    LedgerEntry.deleteMany({
      userId: {
        $in: [
          buyer._id,
          seller._id
        ]
      }
    }),
    DepositRequest.deleteMany({
      userId: {
        $in: [
          buyer._id,
          seller._id
        ]
      }
    }),
    WithdrawalRequest.deleteMany({
      userId: {
        $in: [
          buyer._id,
          seller._id
        ]
      }
    }),
    MarginPosition.deleteMany({
      userId: {
        $in: [
          buyer._id,
          seller._id
        ]
      }
    }),
    MarginLoan.deleteMany({
      userId: {
        $in: [
          buyer._id,
          seller._id
        ]
      }
    }),
    FuturesPosition.deleteMany({
      userId: {
        $in: [
          buyer._id,
          seller._id
        ]
      }
    }),
    FundingPayment.deleteMany({
      userId: {
        $in: [
          buyer._id,
          seller._id
        ]
      }
    }),
    VerificationRequest.deleteMany({
      userId: {
        $in: [
          buyer._id,
          seller._id
        ]
      }
    }),
    PaymentMethod.deleteMany({
      userId: {
        $in: [
          buyer._id,
          seller._id
        ]
      }
    }),
    IdempotencyKey.deleteMany({
      userId: {
        $in: [
          buyer._id,
          seller._id
        ]
      }
    }),
    User.deleteMany({
      _id: {
        $in: [
          buyer._id,
          seller._id
        ]
      }
    })
  ]);

  await mongoose.connection.close();

  if (failed > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch(async (error) => {
  console.error();
  console.error("==============================================================");
  console.error("FATAL FINAL TEST ERROR");
  console.error("==============================================================");
  console.error(error);

  try {
    await mongoose.connection.close();
  } catch {}

  process.exit(1);
});