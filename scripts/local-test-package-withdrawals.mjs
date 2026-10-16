#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
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
const qaUsername = process.env.QA_TEST_USERNAME || "qauser_mvba0lmg625a99";
const qaPassword = process.env.QA_TEST_PASSWORD || "QaUser#100000";
const round8 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 1e8) / 1e8;
const suffix = Date.now().toString(36) + crypto.randomBytes(4).toString("hex");

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
  try { body = JSON.parse(raw); } catch { body = { message: raw.slice(0, 500) }; }
  return { status: response.status, ok: response.ok, body, headers: response.headers };
}

function cookieFromLogin(response) {
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return cookies.map((item) => item.split(";")[0]).find((item) => item.startsWith("arabtrade_session="));
}

async function main() {
  let connected = false;
  let fixtureCredit = 0;
  let requestIds = [];
  try {
    // Verify local server first; a failed health check must leave all test data unchanged.
    const health = await api("/api/health");
    assert.equal(health.ok && health.body?.database === "connected", true,
      "Local QA server is not available at " + baseUrl + "; no changes made.");

    await mongoose.connect(testUri, { dbName, serverSelectionTimeoutMS: 12000 });
    connected = true;
    const db = mongoose.connection.db;

    const user = await db.collection("users").findOne({
      username: qaUsername, isActive: true, isVerified: true
    });
    assert.ok(user, "QA test user was not found in arabtrade_test.");

    const active = await db.collection("userpackages").findOne(
      { userId: user._id, status: "active" },
      { sort: { createdAt: -1 } },
    );
    assert.ok(active, "No active package exists for the QA user.");
    assert.equal(round8(active.lockedEarnings), 0, "Active package already has locked funds; stopping before changes.");

    const previousRequests = await db.collection("withdrawalrequests").find({
      userId: user._id,
      type: { $ne: "general" },
      status: { $in: ["pending", "approved"] },
    }).toArray();
    assert.equal(previousRequests.length, 0,
      "A pending or approved package withdrawal already exists for this QA user; stopping to avoid overlapping histories.");

    const plan = await db.collection("investmentpackages").findOne({ _id: active.packageId });
    assert.ok(plan, "Active package catalog entry missing.");
    const minimum = Number(plan.withdrawalMinimum || 100);
    const amount = minimum;
    assert.ok(amount > 0 && amount === round8(amount), "The package minimum is invalid for a test withdrawal.");
    assert.ok(minimum <= Number(active.investedAmount || 0), "The configured minimum exceeds this package account\u2019s first-stage withdrawal cap; stopped before creating the test balance.");

    const beforeSetupBalance = round8(active.availableEarnings);
    if (beforeSetupBalance < amount) {
      fixtureCredit = round8(amount - beforeSetupBalance);
      const seedUpdate = await db.collection("userpackages").updateOne(
        { _id: active._id, userId: user._id, status: "active", lockedEarnings: 0 },
        { $inc: { availableEarnings: fixtureCredit, totalRealizedEarnings: fixtureCredit } },
      );
      assert.equal(seedUpdate.modifiedCount, 1, "Could not prepare a test-only package balance.");
      await db.collection("packageledgers").insertOne({
        userId: user._id,
        userPackageId: active._id,
        type: "reward",
        asset: "USDT",
        amount: fixtureCredit,
        note: "QA ONLY: synthetic balance fixture for withdrawal lifecycle test; not a real earning.",
        createdAt: new Date(),
      });
    }

    const fundedAccount = await db.collection("userpackages").findOne({ _id: active._id, userId: user._id });
    const fundedBalance = round8(fundedAccount.availableEarnings);
    assert.ok(fundedBalance >= amount, "Test fixture failed to reach the package minimum.");

    const userLogin = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: user.username, password: qaPassword }),
    });
    assert.equal(userLogin.ok, true, "QA user login failed: " + (userLogin.body.message || userLogin.status));
    const userCookie = cookieFromLogin(userLogin);
    assert.ok(userCookie, "QA user login did not return session cookie.");

    const adminUsername = "qaadmin_" + suffix;
    const adminEmail = adminUsername + "@example.test";
    const adminPassword = "QaAdmin#100000";
    const adminId = new mongoose.Types.ObjectId();
    await db.collection("users").insertOne({
      _id: adminId,
      arabTradeId: crypto.randomInt(10000000, 99999999),
      name: "QA Withdrawal Admin",
      username: adminUsername,
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, 12),
      role: "admin_leader",
      referralCode: "QA" + crypto.randomBytes(8).toString("hex").toUpperCase(),
      referredBy: null,
      isVerified: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const adminLogin = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: adminUsername, password: adminPassword }),
    });
    assert.equal(adminLogin.ok, true, "Synthetic QA admin login failed: " + (adminLogin.body.message || adminLogin.status));
    const adminCookie = cookieFromLogin(adminLogin);
    assert.ok(adminCookie, "QA admin login did not return session cookie.");

    const postWithdrawal = () => api("/api/withdrawals", {
      method: "POST",
      cookie: userCookie,
      body: JSON.stringify({
        type: "package",
        packageId: String(active.packageId),
        amount,
        asset: "USDT",
        network: "TRC20",
        payoutAddress: "QA-withdrawal-" + suffix,
      }),
    });

    const firstRequest = await postWithdrawal();
    assert.equal(firstRequest.status, 201,
      "First package withdrawal request failed: " + (firstRequest.body.message || firstRequest.status));
    let firstRow = await db.collection("withdrawalrequests").findOne(
      { userId: user._id, type: "package", status: "pending" },
      { sort: { createdAt: -1 } },
    );
    assert.ok(firstRow, "First pending request was not stored.");
    requestIds.push(String(firstRow._id));

    const afterFirstReservation = await db.collection("userpackages").findOne({ _id: active._id, userId: user._id });
    assert.equal(round8(afterFirstReservation.availableEarnings), round8(fundedBalance - amount),
      "First request did not reserve the available amount.");
    assert.equal(round8(afterFirstReservation.lockedEarnings), amount,
      "First request did not move the amount to lockedEarnings.");

    const secondWhilePending = await postWithdrawal();
    assert.equal(secondWhilePending.ok, false, "A second withdrawal was accepted while the first was still pending.");
    assert.equal(secondWhilePending.status, 409, "A second request while pending returned an unexpected status.");

    const afterSecondAttempt = await db.collection("withdrawalrequests").countDocuments({
      userId: user._id, type: "package", status: "pending"
    });
    assert.equal(afterSecondAttempt, 1, "More than one pending package withdrawal exists after the second attempt.");

    const rejectResult = await api("/api/admin/withdrawals", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ action: "reject", id: String(firstRow._id) }),
    });
    assert.equal(rejectResult.ok && rejectResult.body.success === true, true,
      "Admin rejection failed: " + (rejectResult.body.message || rejectResult.status));

    firstRow = await db.collection("withdrawalrequests").findOne({ _id: firstRow._id });
    const afterReject = await db.collection("userpackages").findOne({ _id: active._id, userId: user._id });
    assert.equal(firstRow.status, "rejected", "Withdrawal request was not marked rejected.");
    assert.equal(round8(afterReject.availableEarnings), fundedBalance, "Rejected amount did not return to available package earnings.");
    assert.equal(round8(afterReject.lockedEarnings), 0, "Rejected request left locked earnings behind.");

    const secondRequest = await postWithdrawal();
    assert.equal(secondRequest.status, 201,
      "New request after rejection failed: " + (secondRequest.body.message || secondRequest.status));
    const approvedRow = await db.collection("withdrawalrequests").findOne(
      { userId: user._id, type: "package", status: "pending" },
      { sort: { createdAt: -1 } },
    );
    assert.ok(approvedRow, "Second pending request was not stored.");
    requestIds.push(String(approvedRow._id));

    const approveResult = await api("/api/admin/withdrawals", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ action: "approve", id: String(approvedRow._id) }),
    });
    assert.equal(approveResult.ok && approveResult.body.success === true, true,
      "Admin approval failed: " + (approveResult.body.message || approveResult.status));

    const finalRequest = await db.collection("withdrawalrequests").findOne({ _id: approvedRow._id });
    const finalAccount = await db.collection("userpackages").findOne({ _id: active._id, userId: user._id });

    const report = {
      result: "PASS",
      database: dbName,
      server: baseUrl,
      user: user.username,
      package: active.packageName,
      minimumWithdrawal: minimum,
      qaFixtureCredit: fixtureCredit,
      requestedAmount: amount,
      checks: {
        firstRequestCreatedAndReserved: true,
        secondRequestWhilePendingRejected: {
          status: secondWhilePending.status,
          message: secondWhilePending.body.message || "",
          onlyOnePendingRequest: afterSecondAttempt === 1,
        },
        rejectionReturnsBalance: {
          requestStatus: firstRow.status,
          availableAfterReject: round8(afterReject.availableEarnings),
          lockedAfterReject: round8(afterReject.lockedEarnings),
          expectedAvailable: fundedBalance,
        },
        approvalSettlesLockWithoutReturningAmount: {
          requestStatus: finalRequest.status,
          availableAfterApproval: round8(finalAccount.availableEarnings),
          lockedAfterApproval: round8(finalAccount.lockedEarnings),
          expectedAvailable: round8(fundedBalance - amount),
        },
      },
      requestIds,
      note: fixtureCredit > 0
        ? "A clearly labeled QA-only synthetic package balance was added because the real test balance was below the minimum. No production database was used."
        : "The existing QA package balance was sufficient; no synthetic balance was added.",
    };

    assert.equal(finalRequest.status, "approved", "Request did not reach approved status.");
    assert.equal(round8(finalAccount.availableEarnings), round8(fundedBalance - amount),
      "Approved request did not consume the withdrawn amount.");
    assert.equal(round8(finalAccount.lockedEarnings), 0, "Approved request left a stale package lock.");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (connected) await mongoose.disconnect().catch(() => {});
  }
}

main().catch(error => {
  console.error(JSON.stringify({
    result: "FAIL",
    error: error instanceof Error ? error.message : String(error),
    note: "If local server preflight failed, no withdrawal request was submitted."
  }, null, 2));
  process.exitCode = 1;
});
