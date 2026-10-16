#!/usr/bin/env node

import assert from "node:assert/strict";
import mongoose from "mongoose";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const sourceUri = process.env.MONGODB_URI;
if (!sourceUri) throw new Error("MONGODB_URI is not configured.");

const testUrl = new URL(sourceUri);
testUrl.pathname = "/arabtrade_test";
const testUri = testUrl.toString();
const dbName = decodeURIComponent(new URL(testUri).pathname.replace(/^\/+/, ""));
if (dbName !== "arabtrade_test") {
  throw new Error("Safety stop: database must be arabtrade_test.");
}

const baseUrl = (process.env.LOCAL_TEST_SERVER_URL || "http://127.0.0.1:39023").replace(/\/+$/, "");
const localUrl = new URL(baseUrl);
if (
  localUrl.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "::1"].includes(localUrl.hostname)
) {
  throw new Error("Safety stop: the test API must be a local loopback server.");
}

const username = process.env.QA_TEST_USERNAME || "qauser_mvba0lmg625a99";
const password = process.env.QA_TEST_PASSWORD || "QaUser#100000";
const CYCLES = 3;
const round8 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 1e8) / 1e8;

async function api(path, options = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  const raw = await response.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = { message: raw.slice(0, 600) };
  }
  return { status: response.status, ok: response.ok, body, headers: response.headers };
}

function cookieFromLogin(response) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  return cookies
    .filter(Boolean)
    .map((item) => item.split(";")[0])
    .find((item) => item.startsWith("arabtrade_session="));
}

async function sumDeposit(db, userId) {
  const rows = await db.collection("depositbalances").find({ userId }).toArray();
  return round8(rows
    .filter((row) => String(row.asset || "").trim().toUpperCase() === "USDT")
    .reduce((sum, row) => sum + Number(row.available || 0), 0));
}

async function packageSnapshot(db, userId, planId) {
  const rows = await db.collection("userpackages").find({ userId, packageId: planId }).toArray();
  return {
    balance: round8(rows.reduce((sum, row) => sum + Number(row.availableEarnings || 0), 0)),
    locked: round8(rows.reduce((sum, row) => sum + Number(row.lockedEarnings || 0), 0)),
    accounts: rows.length,
  };
}

async function changePackage({ db, user, cookie, sourcePlan, targetPlan, expectedRefund, cycle, step }) {
  const activeRows = await db.collection("userpackages").find({
    userId: user._id,
    status: "active",
  }).toArray();
  assert.equal(activeRows.length, 1, "Expected exactly one active package immediately before a change.");

  const current = activeRows[0];
  assert.equal(String(current.packageId), String(sourcePlan._id), "Active package does not match the expected source package.");
  assert.equal(round8(current.lockedEarnings), 0, "Active package has locked earnings; stopped before changing packages.");
  assert.equal(
    round8(Number(current.investedAmount || 0) * 0.5),
    expectedRefund,
    "Refund rule differs from the expected 50% of the package activation amount.",
  );

  const beforeDeposit = await sumDeposit(db, user._id);
  const beforeAvailable = round8(current.availableEarnings);
  const response = await api("/api/packages", {
    method: "POST",
    cookie,
    body: JSON.stringify({
      action: "change",
      packageId: String(targetPlan._id),
      userPackageId: String(current._id),
    }),
  });

  assert.equal(
    response.ok && response.body?.success === true,
    true,
    `Cycle ${cycle} (${step}) change failed: ${response.body?.message || response.status}`,
  );
  assert.equal(round8(response.body.cancellationRefund), expectedRefund,
    `Cycle ${cycle} (${step}) API response returned an unexpected refund.`);

  const cancelled = await db.collection("userpackages").findOne({ _id: current._id, userId: user._id });
  assert.equal(cancelled?.status, "cancelled", "Previous package was not cancelled.");
  assert.equal(cancelled?.cancellationRefundPackageCredited, true, "Refund-credit flag is not true.");
  assert.equal(round8(cancelled?.cancellationRefund), expectedRefund, "Stored cancellation refund is incorrect.");
  assert.equal(
    round8(Number(cancelled?.availableEarnings || 0) - beforeAvailable),
    expectedRefund,
    "Available balance of the cancelled package did not rise by the actual refund.",
  );

  const refundLedger = await db.collection("packageledgers").findOne({
    userId: user._id,
    userPackageId: current._id,
    type: "cancellation_refund",
    amount: expectedRefund,
  });
  assert.ok(refundLedger, "No matching cancellation_refund row was written to the package ledger.");

  const newActive = await db.collection("userpackages").findOne({
    userId: user._id,
    status: "active",
  });
  assert.ok(newActive, "The target package did not become active.");
  assert.equal(String(newActive.packageId), String(targetPlan._id), "Wrong target package became active.");
  assert.equal(round8(newActive.investedAmount), round8(targetPlan.price), "Target package activation amount is wrong.");

  const afterDeposit = await sumDeposit(db, user._id);
  assert.equal(
    afterDeposit,
    round8(beforeDeposit - Number(targetPlan.price)),
    "Deposit balance did not decrease by exactly the target package price.",
  );

  return {
    cycle,
    step,
    from: sourcePlan.name,
    to: targetPlan.name,
    refundCreditedToCancelledPackage: expectedRefund,
    cancelledPackageBalanceBefore: beforeAvailable,
    cancelledPackageBalanceAfter: round8(cancelled.availableEarnings),
    depositBefore: beforeDeposit,
    depositDeductedForNewPackage: round8(targetPlan.price),
    depositAfter: afterDeposit,
    refundLedgerVerified: true,
  };
}

async function main() {
  let connected = false;
  try {
    // Validate the API before connecting or requesting any package change.
    const health = await api("/api/health");
    assert.equal(
      health.ok && health.body?.database === "connected",
      true,
      "Local QA server is unavailable at " + baseUrl + "; no package changes were requested.",
    );

    await mongoose.connect(testUri, { dbName, serverSelectionTimeoutMS: 12000 });
    connected = true;
    const db = mongoose.connection.db;

    const user = await db.collection("users").findOne({
      username,
      isActive: true,
      isVerified: true,
    });
    assert.ok(user, "Expected QA user was not found in arabtrade_test.");

    const [bronze, silver] = await Promise.all([
      db.collection("investmentpackages").findOne({ name: /^Bronze$/i, enabled: { $ne: false } }),
      db.collection("investmentpackages").findOne({ name: /^Silver$/i, enabled: { $ne: false } }),
    ]);
    assert.ok(bronze && silver, "Enabled Bronze and Silver plans are both required.");
    assert.equal(round8(bronze.price), 50, "Expected Bronze to cost 50 USDT; stopped without changes.");
    assert.equal(round8(silver.price), 100, "Expected Silver to cost 100 USDT; stopped without changes.");

    const activeRows = await db.collection("userpackages").find({
      userId: user._id,
      status: "active",
    }).toArray();
    assert.equal(activeRows.length, 1, "Expected exactly one active package before starting.");
    assert.equal(String(activeRows[0].packageId), String(silver._id),
      "QA account must start on Silver. No changes were made.");
    assert.equal(round8(activeRows[0].investedAmount), 100, "Active Silver activation value is not 100 USDT.");
    assert.equal(round8(activeRows[0].lockedEarnings), 0, "Active Silver has locked funds; no changes were made.");

    const pendingWithdrawals = await db.collection("withdrawalrequests").countDocuments({
      userId: user._id,
      status: "pending",
    });
    assert.equal(pendingWithdrawals, 0, "A withdrawal is pending; no package changes were made.");

    const allAccountRows = await db.collection("userpackages").find({ userId: user._id }).toArray();
    assert.equal(
      round8(allAccountRows.reduce((sum, row) => sum + Number(row.lockedEarnings || 0), 0)),
      0,
      "A package account has locked funds; no package changes were made.",
    );

    const bronzeBefore = await packageSnapshot(db, user._id, bronze._id);
    const silverBefore = await packageSnapshot(db, user._id, silver._id);
    const depositBefore = await sumDeposit(db, user._id);

    // This is a state-specific test, not a generic loop: refuse to run unless
    // the previously verified organic Bronze balance and cleared Silver balance are present.
    assert.equal(bronzeBefore.balance, 27,
      "Expected current Bronze package balance to be exactly 27 USDT; no changes were made.");
    assert.equal(silverBefore.balance, 0,
      "Expected current Silver package balance to be 0 USDT; no changes were made.");

    const requiredDeposit = CYCLES * (Number(bronze.price) + Number(silver.price));
    assert.ok(depositBefore >= requiredDeposit,
      `Need at least ${requiredDeposit} USDT in deposit balance for ${CYCLES} real package-change cycles; found ${depositBefore}. No changes were made.`);

    const login = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: user.username, password }),
    });
    assert.equal(login.ok, true, "QA login failed: " + (login.body?.message || login.status));
    const cookie = cookieFromLogin(login);
    assert.ok(cookie, "QA login did not return the session cookie.");

    const cycleResults = [];
    for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
      // Leaving Silver credits 50 USDT to that cancelled Silver account.
      cycleResults.push(await changePackage({
        db, user, cookie, sourcePlan: silver, targetPlan: bronze,
        expectedRefund: 50, cycle, step: "Silver -> Bronze",
      }));

      // Leaving Bronze credits 25 USDT to that cancelled Bronze account.
      cycleResults.push(await changePackage({
        db, user, cookie, sourcePlan: bronze, targetPlan: silver,
        expectedRefund: 25, cycle, step: "Bronze -> Silver",
      }));
    }

    const bronzeAfter = await packageSnapshot(db, user._id, bronze._id);
    const silverAfter = await packageSnapshot(db, user._id, silver._id);
    const depositAfter = await sumDeposit(db, user._id);
    const activeAfter = await db.collection("userpackages").findOne({
      userId: user._id,
      status: "active",
    });

    assert.equal(bronzeAfter.balance, round8(bronzeBefore.balance + CYCLES * 25),
      "Bronze package aggregate did not increase by 25 USDT per cycle.");
    assert.equal(silverAfter.balance, round8(silverBefore.balance + CYCLES * 50),
      "Silver package aggregate did not increase by 50 USDT per cycle.");
    assert.equal(depositAfter, round8(depositBefore - requiredDeposit),
      "Final deposit balance does not match the six completed package activations.");
    assert.equal(String(activeAfter?.packageId), String(silver._id),
      "The test did not finish with Silver active.");

    console.log(JSON.stringify({
      result: "PASS",
      database: dbName,
      apiServer: baseUrl,
      user: user.username,
      balanceSource: "Real /api/packages change operations only; no direct balance writes or synthetic balance credits.",
      cycles: CYCLES,
      refundRule: "50% of the package being left, credited to that cancelled package's own balance.",
      before: {
        activePackage: "Silver",
        bronzeAvailable: bronzeBefore.balance,
        silverAvailable: silverBefore.balance,
        depositAvailable: depositBefore,
      },
      eachCycle: {
        leavingSilverCreditsToSilver: 50,
        leavingBronzeCreditsToBronze: 25,
        depositSpentAcrossBothChanges: 150,
      },
      operations: cycleResults,
      after: {
        activePackage: activeAfter?.packageName,
        bronzeAvailable: bronzeAfter.balance,
        bronzeIncrease: round8(bronzeAfter.balance - bronzeBefore.balance),
        silverAvailable: silverAfter.balance,
        silverIncrease: round8(silverAfter.balance - silverBefore.balance),
        depositAvailable: depositAfter,
        depositDecrease: round8(depositBefore - depositAfter),
        lockedAcrossAllPackageAccounts: round8((await db.collection("userpackages").find({ userId: user._id }).toArray())
          .reduce((sum, row) => sum + Number(row.lockedEarnings || 0), 0)),
      },
      assertions: {
        threeRealBronzeRefundsOf25: true,
        threeRealSilverRefundsOf50: true,
        allRefundsVerifiedInPackageLedger: true,
        depositsDebitedThroughPackageApi: true,
        noSyntheticBalanceCreditPerformed: true,
      },
    }, null, 2));
  } finally {
    if (connected) await mongoose.disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    result: "FAIL",
    error: error instanceof Error ? error.message : String(error),
    note: "The script performs no direct balance writes. If an API call succeeded before a later assertion failed, review the printed error and current local QA database state before rerunning.",
  }, null, 2));
  process.exitCode = 1;
});
