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
if (dbName !== "arabtrade_test") throw new Error("Safety stop: database must be arabtrade_test.");

const baseUrl = (process.env.LOCAL_TEST_SERVER_URL || "http://127.0.0.1:39023").replace(/\/+$/, "");
const username = process.env.QA_TEST_USERNAME || "qauser_mvba0lmg625a99";
const password = process.env.QA_TEST_PASSWORD || "QaUser#100000";
const round8 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 1e8) / 1e8;

async function callApi(path, options = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(8000),
  });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = { message: raw.slice(0, 600) }; }
  return { status: response.status, ok: response.ok, body, headers: response.headers };
}

async function main() {
  let connected = false;
  try {
    // Fail fast before changing anything if the isolated test server is not available.
    const health = await callApi("/api/health");
    assert.equal(health.ok && health.body?.database === "connected", true,
      "Isolated QA server is not ready at " + baseUrl + ". Nothing was changed. Start/recover the isolated local test server first.");

    await mongoose.connect(testUri, { dbName, serverSelectionTimeoutMS: 12000 });
    connected = true;
    const db = mongoose.connection.db;

    const user = await db.collection("users").findOne({ username, isActive: true, isVerified: true });
    assert.ok(user, "The expected QA user was not found in arabtrade_test.");

    const active = await db.collection("userpackages").findOne(
      { userId: user._id, status: "active" },
      { sort: { createdAt: -1 } },
    );
    assert.ok(active, "No active package found for the QA user.");
    assert.match(String(active.packageName || ""), /^Bronze$/i, "QA user's active package must be Bronze before this test.");
    assert.equal(round8(active.lockedEarnings), 0, "Bronze has locked earnings; test stopped without changing package.");

    const [bronze, silver] = await Promise.all([
      db.collection("investmentpackages").findOne({ name: /^Bronze$/i }),
      db.collection("investmentpackages").findOne({ name: /^Silver$/i, enabled: { $ne: false } }),
    ]);
    assert.ok(bronze, "Bronze package is missing.");
    assert.ok(silver, "Enabled Silver package is missing.");
    assert.equal(String(active.packageId), String(bronze._id), "Active Bronze account does not reference the Bronze catalog plan.");

    const effectiveBronzeMinimum = Number(bronze.withdrawalMinimum || 100);
    const effectiveSilverMinimum = Number(silver.withdrawalMinimum || 100);
    const refundExpected = round8(Number(active.investedAmount || 0) * 0.5);
    assert.equal(round8(active.investedAmount), 50, "Expected this test to verify a Bronze activation price of 50 USDT.");
    assert.equal(refundExpected, 25, "Expected a 25 USDT Bronze refund.");

    const depositBefore = round8((await db.collection("depositbalances").find({ userId: user._id }).toArray())
      .filter(row => String(row.asset || "").trim().toUpperCase() === "USDT")
      .reduce((sum, row) => sum + Number(row.available || 0), 0));
    const before = {
      username: user.username,
      activePackage: active.packageName,
      investedAmount: round8(active.investedAmount),
      availableEarnings: round8(active.availableEarnings),
      lockedEarnings: round8(active.lockedEarnings),
      depositAvailable: depositBefore,
      bronzeMinimumStored: bronze.withdrawalMinimum ?? null,
      bronzeMinimumEffective: effectiveBronzeMinimum,
      silverPrice: round8(silver.price),
    };

    const login = await callApi("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: user.username, password }),
    });
    assert.equal(login.ok, true, "Local login failed: " + (login.body.message || login.status));
    const cookies = typeof login.headers.getSetCookie === "function" ? login.headers.getSetCookie() : [];
    const cookie = cookies.map(value => value.split(";")[0]).find(value => value.startsWith("arabtrade_session="));
    assert.ok(cookie, "Login succeeded but the session cookie was missing.");

    const changed = await callApi("/api/packages", {
      method: "POST",
      cookie,
      body: JSON.stringify({ action: "change", packageId: String(silver._id), userPackageId: String(active._id) }),
    });

    const bronzeAfter = await db.collection("userpackages").findOne({ _id: active._id, userId: user._id });
    const silverAfter = await db.collection("userpackages").findOne(
      { userId: user._id, status: "active" },
      { sort: { createdAt: -1 } },
    );
    const depositAfter = round8((await db.collection("depositbalances").find({ userId: user._id }).toArray())
      .filter(row => String(row.asset || "").trim().toUpperCase() === "USDT")
      .reduce((sum, row) => sum + Number(row.available || 0), 0));
    const refundLedger = await db.collection("packageledgers").find({
      userId: user._id,
      userPackageId: active._id,
      type: "cancellation_refund",
    }).sort({ createdAt: -1 }).limit(1).next();

    const result = {
      database: dbName,
      server: baseUrl,
      before,
      changeApi: { status: changed.status, success: changed.body.success === true, message: changed.body.message || "" },
      expected: {
        refundAddedToOldBronzeBalance: refundExpected,
        newPackagePriceDeductedFromDeposit: round8(silver.price),
        depositExpectedAfter: round8(depositBefore - Number(silver.price)),
      },
      after: {
        oldBronzeStatus: bronzeAfter?.status,
        oldBronzeAvailableEarnings: round8(bronzeAfter?.availableEarnings),
        oldBronzeBalanceIncrease: round8(Number(bronzeAfter?.availableEarnings || 0) - Number(active.availableEarnings || 0)),
        oldBronzeCancellationRefund: round8(bronzeAfter?.cancellationRefund),
        oldBronzeRefundFlag: bronzeAfter?.cancellationRefundPackageCredited,
        refundLedgerAmount: refundLedger ? round8(refundLedger.amount) : null,
        activePackage: silverAfter?.packageName,
        activePackagePrice: round8(silverAfter?.investedAmount),
        depositAvailable: depositAfter,
        depositDeducted: round8(depositBefore - depositAfter),
      },
      withdrawalMinimums: {
        bronzeStored: bronze.withdrawalMinimum ?? null,
        bronzeEffective: effectiveBronzeMinimum,
        silverStored: silver.withdrawalMinimum ?? null,
        silverEffective: effectiveSilverMinimum,
        unit: "USDT",
      },
    };

    assert.equal(changed.ok, true, "Package change request failed: " + (changed.body.message || changed.status));
    assert.equal(bronzeAfter?.status, "cancelled", "Old Bronze account was not cancelled.");
    assert.equal(round8(Number(bronzeAfter?.availableEarnings || 0) - Number(active.availableEarnings || 0)), refundExpected,
      "The old Bronze balance did not increase by exactly 25 USDT.");
    assert.equal(round8(bronzeAfter?.cancellationRefund), refundExpected, "Recorded Bronze cancellation refund was not 25 USDT.");
    assert.equal(bronzeAfter?.cancellationRefundPackageCredited, true, "Refund credited flag is not true.");
    assert.equal(round8(refundLedger?.amount), refundExpected, "Package ledger does not show exactly one 25 USDT refund.");
    assert.equal(String(silverAfter?.packageId || ""), String(silver._id), "Silver is not the active package after change.");
    assert.equal(round8(silverAfter?.investedAmount), round8(silver.price), "New Silver activation amount is incorrect.");
    assert.equal(depositAfter, round8(depositBefore - Number(silver.price)), "Deposit balance did not decrease by Silver price only.");

    console.log(JSON.stringify({ result: "PASS", ...result }, null, 2));
  } finally {
    if (connected) await mongoose.disconnect().catch(() => {});
  }
}

main().catch(error => {
  console.error(JSON.stringify({
    result: "FAIL",
    error: error instanceof Error ? error.message : String(error),
    note: "If the QA server health check failed, no package change was submitted."
  }, null, 2));
  process.exitCode = 1;
});
