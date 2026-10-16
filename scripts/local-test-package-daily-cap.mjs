#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import mongoose from "mongoose";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const sourceUri = process.env.MONGODB_URI;
if (!sourceUri) throw new Error("MONGODB_URI is not configured.");

const testUrl = new URL(sourceUri);
testUrl.pathname = "/arabtrade_test";
const testUri = testUrl.toString();
const dbName = decodeURIComponent(new URL(testUri).pathname.slice(1));
if (dbName !== "arabtrade_test") {
  throw new Error("Safety stop: this test may use only arabtrade_test.");
}

const username = process.env.QA_TEST_USERNAME || "qauser_mvba0lmg625a99";
const password = process.env.QA_TEST_PASSWORD || "QaUser#100000";
const round8 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 1e8) / 1e8;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function api(baseUrl, endpoint, options = {}) {
  const response = await fetch(baseUrl + endpoint, {
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
  try { body = JSON.parse(raw); } catch { body = { message: raw.slice(0, 600) }; }
  return { status: response.status, ok: response.ok, body, headers: response.headers };
}

function sessionCookie(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  return values.map((value) => value.split(";")[0])
    .find((value) => value.startsWith("arabtrade_session="));
}

function packageAmountUsedToday(items, planId, dayStart) {
  return round8(items.reduce((sum, item) => {
    if (item.status === "rejected" || item.type === "general") return sum;
    const created = item.createdAt ? new Date(item.createdAt).getTime() : Number.NaN;
    if (!Number.isFinite(created) || created < dayStart.getTime()) return sum;
    const allocations = Array.isArray(item.allocations) ? item.allocations : [];
    const hasAllocationPlanId = allocations.some((allocation) => allocation.packageId);
    if (hasAllocationPlanId) {
      return sum + allocations
        .filter((allocation) => String(allocation.packageId || "") === String(planId))
        .reduce((inner, allocation) => inner + Number(allocation.amount || 0), 0);
    }
    if (String(item.packageId || "") !== String(planId)) return sum;
    return sum + (allocations.length
      ? allocations.reduce((inner, allocation) => inner + Number(allocation.amount || 0), 0)
      : Number(item.amount || 0));
  }, 0));
}

async function main() {
  let connected = false;
  let app = null;
  let logFd = null;
  let logFile = null;
  let isolatedDir = null;
  try {
    await mongoose.connect(testUri, { dbName, serverSelectionTimeoutMS: 12000 });
    connected = true;
    const db = mongoose.connection.db;

    const user = await db.collection("users").findOne({
      username,
      isActive: true,
      isVerified: true,
    });
    assert.ok(user, "Expected QA user not found in arabtrade_test.");

    const pendingCountBefore = await db.collection("withdrawalrequests").countDocuments({
      userId: user._id,
      status: "pending",
    });
    assert.equal(pendingCountBefore, 0,
      "QA user already has a pending withdrawal. No test request was sent; resolve that request before rerunning.");

    const allPackagesBefore = await db.collection("userpackages")
      .find({ userId: user._id })
      .sort({ createdAt: 1 })
      .toArray();
    assert.ok(allPackagesBefore.length > 0, "QA user has no package accounts.");
    const packageSnapshotBefore = allPackagesBefore.map((row) => ({
      id: String(row._id),
      packageId: String(row.packageId),
      status: row.status,
      availableEarnings: round8(row.availableEarnings),
      lockedEarnings: round8(row.lockedEarnings),
      investedAmount: round8(row.investedAmount),
    }));
    const requestsBefore = await db.collection("withdrawalrequests")
      .find({ userId: user._id })
      .sort({ createdAt: 1 })
      .toArray();
    const requestIdsBefore = requestsBefore.map((row) => String(row._id));

    const sourceDir = process.cwd();
    isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), "arabtrade-daily-cap-qa-"));
    const excluded = new Set([".git", ".next", "node_modules", ".turbo", "coverage", "out"]);
    fs.cpSync(sourceDir, isolatedDir, {
      recursive: true,
      filter(source) {
        const relative = path.relative(sourceDir, source);
        if (!relative) return true;
        return !excluded.has(relative.split(path.sep)[0]);
      },
    });
    fs.symlinkSync(path.join(sourceDir, "node_modules"), path.join(isolatedDir, "node_modules"), "dir");

    const port = await getFreePort();
    const baseUrl = "http://127.0.0.1:" + port;
    logFile = path.join(os.tmpdir(), "arabtrade-daily-cap-" + port + ".log");
    logFd = fs.openSync(logFile, "a");
    app = spawn("npm", ["run", "dev", "--", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: isolatedDir,
      env: {
        ...process.env,
        MONGODB_URI: testUri,
        AUTH_SECRET: process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex"),
        NODE_ENV: "development",
        PORT: String(port),
        TURBOREPO_ROOT: isolatedDir,
      },
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    fs.closeSync(logFd);
    logFd = null;
    app.unref();

    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        const health = await fetch(baseUrl + "/api/health", { signal: AbortSignal.timeout(2000) });
        const body = await health.json().catch(() => ({}));
        if (health.ok && body.database === "connected") {
          ready = true;
          break;
        }
      } catch {}
      await pause(1000);
    }
    if (!ready) {
      const details = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").slice(-6000) : "";
      throw new Error("The isolated local app did not become ready. No withdrawal request was made. Log: " + logFile + "\n" + details);
    }

    const login = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: username, password }),
    });
    assert.equal(login.ok, true, "QA login failed: " + (login.body.message || login.status));
    const cookie = sessionCookie(login);
    assert.ok(cookie, "QA login did not return the session cookie.");

    const beforeResponse = await api(baseUrl, "/api/withdrawals", { cookie });
    assert.equal(beforeResponse.ok && beforeResponse.body.success === true, true,
      "Could not load withdrawal balances: " + (beforeResponse.body.message || beforeResponse.status));

    const requestResults = [];
    const utcStart = new Date();
    utcStart.setUTCHours(0, 0, 0, 0);
    const packageNames = [/^Bronze$/i, /^Silver$/i];

    for (const namePattern of packageNames) {
      const plan = beforeResponse.body.packages.find((item) => namePattern.test(String(item.name || "")));
      assert.ok(plan?.account?.hasAccount, "Expected package balance card was not returned for " + namePattern);

      const rows = allPackagesBefore.filter((row) => String(row.packageId) === String(plan._id));
      assert.ok(rows.length > 0, "Database contains no activation records for " + plan.name);
      const firstActivation = rows.find((row) => Number(row.investedAmount || 0) > 0);
      const activationCap = round8(firstActivation?.investedAmount || 0);
      const usedToday = packageAmountUsedToday(requestsBefore, plan._id, utcStart);
      const expectedAllowance = round8(Math.max(0, activationCap - usedToday));
      const expectedAvailable = round8(Math.max(0, Math.min(Number(plan.account.balance || 0), expectedAllowance)));
      assert.equal(round8(plan.account.allowance), expectedAllowance,
        plan.name + " API allowance does not match initial activation minus today's pending/approved withdrawals.");
      assert.equal(round8(plan.account.available), expectedAvailable,
        plan.name + " API available amount does not match the daily cap.");

      const minimum = Number(plan.minimum || 100);
      assert.ok(Number(plan.account.balance || 0) >= minimum,
        plan.name + " balance is below the configured minimum; cannot prove the daily-cap rejection message.");
      const overCapAmount = round8(Math.max(minimum, expectedAvailable + 1));
      assert.ok(overCapAmount > expectedAvailable, "The test amount must exceed the currently available daily cap.");

      const attempt = await api(baseUrl, "/api/withdrawals", {
        method: "POST",
        cookie,
        body: JSON.stringify({
          type: "package",
          packageId: String(plan._id),
          amount: overCapAmount,
          asset: "USDT",
          network: "TRC20",
          payoutAddress: "QA-daily-cap-no-write-check",
        }),
      });
      assert.equal(attempt.ok, false, plan.name + " accepted a withdrawal exceeding the daily cap.");
      assert.equal(attempt.status, 409, plan.name + " over-cap request returned unexpected status.");
      const expectedMessage = expectedAvailable > 0
        ? "المتاح للسحب " + expectedAvailable + " USDT فقط"
        : "تم استنفاد حد السحب اليومي لهذه الباقة";
      assert.equal(attempt.body.message, expectedMessage,
        plan.name + " returned unexpected over-cap message.");

      const requestsNow = await db.collection("withdrawalrequests")
        .find({ userId: user._id })
        .sort({ createdAt: 1 })
        .toArray();
      assert.deepEqual(requestsNow.map((row) => String(row._id)), requestIdsBefore,
        plan.name + " invalid over-cap attempt unexpectedly created a withdrawal request.");
      const packageRowsNow = await db.collection("userpackages")
        .find({ userId: user._id })
        .sort({ createdAt: 1 })
        .toArray();
      assert.deepEqual(packageRowsNow.map((row) => ({
        id: String(row._id),
        packageId: String(row.packageId),
        status: row.status,
        availableEarnings: round8(row.availableEarnings),
        lockedEarnings: round8(row.lockedEarnings),
        investedAmount: round8(row.investedAmount),
      })), packageSnapshotBefore,
      plan.name + " rejected request changed package balances/status.");

      requestResults.push({
        package: plan.name,
        activationAmount: activationCap,
        packageBalance: round8(plan.account.balance),
        approvedOrPendingUsedToday: usedToday,
        availableToday: expectedAvailable,
        rejectedAttemptAmount: overCapAmount,
        rejectionHttpStatus: attempt.status,
        rejectionMessage: attempt.body.message,
        noNewWithdrawalRequest: true,
        packageBalancesUnchanged: true,
      });
    }

    console.log(JSON.stringify({
      result: "PASS",
      database: dbName,
      server: "isolated local Next.js API started from this working tree",
      user: username,
      balanceSource: "existing QA database balances only; no synthetic credit or direct balance write",
      testedAtUtc: new Date().toISOString(),
      packages: requestResults,
      finalAssertions: {
        overDailyCapRequestRejectedForBothPackages: true,
        noWithdrawalRequestsCreated: true,
        allPackageBalancesUnchanged: true,
      },
    }, null, 2));
  } finally {
    if (logFd !== null) {
      try { fs.closeSync(logFd); } catch {}
    }
    if (app?.pid) {
      try { process.kill(-app.pid, "SIGTERM"); } catch {}
      await pause(800);
    }
    if (isolatedDir && fs.existsSync(isolatedDir)) {
      try { fs.rmSync(isolatedDir, { recursive: true, force: true }); } catch {}
    }
    if (connected) await mongoose.disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    result: "FAIL",
    error: error instanceof Error ? error.message : String(error),
    note: "This test adds no balance and creates no successful withdrawal. A failed precondition stops the run before any over-cap request.",
  }, null, 2));
  process.exitCode = 1;
});
