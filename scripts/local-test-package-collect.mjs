#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import mongoose from "mongoose";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const originalUri = process.env.MONGODB_URI;
if (!originalUri) throw new Error("MONGODB_URI is not configured; load the project's local env first.");

const testUrl = new URL(originalUri);
testUrl.pathname = "/arabtrade_test";
const testUri = testUrl.toString();
const dbName = decodeURIComponent(new URL(testUri).pathname.replace(/^\/+/, ""));
if (dbName !== "arabtrade_test") throw new Error("Safety stop: database must be arabtrade_test.");

const authSecret = process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");
const childEnv = {
  ...process.env,
  MONGODB_URI: testUri,
  AUTH_SECRET: authSecret,
  NODE_ENV: "development",
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round8 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 1e8) / 1e8;

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

async function main() {
  let app = null;
  let db = null;
  let mongoConnected = false;
  let serverLogFile = null;
  let serverUrl = null;
  let pass = false;
  let result = {};

  try {
    await mongoose.connect(testUri, { serverSelectionTimeoutMS: 15000, dbName });
    mongoConnected = true;
    db = mongoose.connection.db;

    const user = await db.collection("users").findOne(
      { name: "QA Test User", username: /^qauser_/, isActive: true, isVerified: true },
      { sort: { createdAt: -1 } },
    );
    assert.ok(user, "QA user not found. Expected a user named QA Test User with username prefix qauser_.");

    const beforeDepositRows = await db.collection("depositbalances").find({ userId: user._id }).toArray();
    const depositBefore = round8(beforeDepositRows
      .filter((row) => String(row.asset || "").trim().toUpperCase() === "USDT")
      .reduce((sum, row) => sum + Number(row.available || 0), 0));

    const port = await getFreePort();
    const baseUrl = "http://127.0.0.1:" + port;
    serverUrl = baseUrl;
    serverLogFile = path.join(os.tmpdir(), "arabtrade-local-test-next-" + port + ".log");
    const logFd = fs.openSync(serverLogFile, "a");
    app = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: process.cwd(),
      env: { ...childEnv, PORT: String(port) },
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    app.unref();
    fs.closeSync(logFd);

    let ready = false;
    for (let i = 0; i < 120; i += 1) {
      try {
        const health = await fetch(baseUrl + "/api/health", { signal: AbortSignal.timeout(2500) });
        if (health.ok) {
          ready = true;
          break;
        }
      } catch {}
      await pause(1000);
    }
    if (!ready) {
      const log = fs.existsSync(serverLogFile) ? fs.readFileSync(serverLogFile, "utf8").slice(-5000) : "";
      throw new Error("Local Next.js did not become ready. The isolated server is not stopped automatically. Log: " + serverLogFile + "\n" + log);
    }

    async function api(path, options = {}) {
      const response = await fetch(baseUrl + path, {
        ...options,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.cookie ? { Cookie: options.cookie } : {}),
          ...(options.headers || {}),
        },
      });
      const raw = await response.text();
      let body;
      try { body = JSON.parse(raw); } catch { body = { message: raw.slice(0, 500) }; }
      return { status: response.status, ok: response.ok, body, headers: response.headers };
    }

    const login = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: user.username, password: "QaUser#100000" }),
    });
    assert.equal(login.ok, true, "QA login failed: " + (login.body.message || login.status));
    const cookies = typeof login.headers.getSetCookie === "function" ? login.headers.getSetCookie() : [];
    const sessionCookie = cookies.map((cookie) => cookie.split(";")[0])
      .find((cookie) => cookie.startsWith("arabtrade_session="));
    assert.ok(sessionCookie, "Login succeeded but did not return arabtrade_session cookie.");

    const packageResponse = await api("/api/packages", { cookie: sessionCookie });
    assert.equal(packageResponse.ok, true, "Could not load packages: " + (packageResponse.body.message || packageResponse.status));

    let active = await db.collection("userpackages").findOne(
      { userId: user._id, status: "active" },
      { sort: { createdAt: -1 } },
    );
    let activationMessage = "Using existing active package; no additional activation was made.";
    if (!active) {
      const plans = Array.isArray(packageResponse.body.packages) ? packageResponse.body.packages : [];
      const plan = plans
        .filter((item) => Number(item.price) > 0 && Number(item.dailyProfit) > 0)
        .sort((a, b) => Number(a.price) - Number(b.price))[0];
      assert.ok(plan, "No enabled package with a positive daily profit was found.");

      assert.ok(depositBefore >= Number(plan.price),
        "Insufficient QA deposit to activate " + plan.name + ": available=" + depositBefore + ", price=" + plan.price);

      const activation = await api("/api/packages", {
        method: "POST",
        cookie: sessionCookie,
        body: JSON.stringify({ action: "activate", packageId: String(plan._id) }),
      });
      assert.equal(activation.ok, true, "Package activation failed: " + (activation.body.message || activation.status));
      active = await db.collection("userpackages").findOne(
        { userId: user._id, status: "active" },
        { sort: { createdAt: -1 } },
      );
      assert.ok(active, "Activation API succeeded but no active UserPackage record was found.");
      activationMessage = "Activated " + plan.name + " through the local API.";
    }

    const investmentPlan = await db.collection("investmentpackages").findOne({ _id: active.packageId });
    assert.ok(investmentPlan, "Active package catalog record was not found.");
    const dailyProfit = round8(Number(investmentPlan.dailyProfit || 0));
    assert.ok(dailyProfit > 0, "Selected active package has zero daily profit; no collection was attempted.");

    const before = {
      packageName: active.packageName,
      packageId: String(active._id),
      packagePrice: Number(active.investedAmount || 0),
      dailyProfit,
      availableEarnings: round8(active.availableEarnings),
      totalRealizedEarnings: round8(active.totalRealizedEarnings),
      depositAvailable: round8((await db.collection("depositbalances").find({ userId: user._id }).toArray())
        .filter((row) => String(row.asset || "").trim().toUpperCase() === "USDT")
        .reduce((sum, row) => sum + Number(row.available || 0), 0)),
    };
    const dailyLedgerCountBefore = await db.collection("packageledgers").countDocuments({
      userId: user._id,
      userPackageId: active._id,
      type: "daily_earning",
    });

    const anchor = new Date(Date.now() - 24 * 60 * 60 * 1000 - 60 * 1000);
    const moved = await db.collection("userpackages").updateOne(
      { _id: active._id, userId: user._id, status: "active" },
      { $set: { lastProfitAt: anchor } },
    );
    assert.equal(moved.modifiedCount, 1, "Could not open the collection window for local QA.");

    const collection = await api("/api/packages", {
      method: "POST",
      cookie: sessionCookie,
      body: JSON.stringify({ action: "collect", userPackageId: String(active._id) }),
    });

    const after = await db.collection("userpackages").findOne({ _id: active._id, userId: user._id });
    assert.ok(after, "Could not reload package account after collection.");
    const depositAfter = round8((await db.collection("depositbalances").find({ userId: user._id }).toArray())
      .filter((row) => String(row.asset || "").trim().toUpperCase() === "USDT")
      .reduce((sum, row) => sum + Number(row.available || 0), 0));
    const dailyLedgerCountAfter = await db.collection("packageledgers").countDocuments({
      userId: user._id,
      userPackageId: active._id,
      type: "daily_earning",
    });

    const actualDelta = round8(Number(after.availableEarnings || 0) - before.availableEarnings);
    const actualTotalDelta = round8(Number(after.totalRealizedEarnings || 0) - before.totalRealizedEarnings);

    result = {
      database: dbName,
      user: { username: user.username, email: user.email },
      activation: activationMessage,
      collectionApi: { status: collection.status, success: collection.body.success === true, message: collection.body.message || "" },
      before,
      after: {
        availableEarnings: round8(after.availableEarnings),
        totalRealizedEarnings: round8(after.totalRealizedEarnings),
        depositAvailable: depositAfter,
      },
      verification: {
        expectedProfit: dailyProfit,
        actualAvailableEarningsIncrease: actualDelta,
        actualTotalRealizedIncrease: actualTotalDelta,
        dailyEarningLedgerRowsAdded: dailyLedgerCountAfter - dailyLedgerCountBefore,
        depositBalanceUnchangedDuringCollection: depositAfter === before.depositAvailable,
      },
    };

    assert.equal(collection.ok, true, "Collection request failed: " + (collection.body.message || collection.status));
    assert.equal(actualDelta, dailyProfit, "FAIL: available package earnings did not increase by the configured daily profit.");
    assert.equal(actualTotalDelta, dailyProfit, "FAIL: total realized earnings did not increase by the configured daily profit.");
    assert.equal(dailyLedgerCountAfter - dailyLedgerCountBefore, 1, "FAIL: expected exactly one daily_earning ledger row.");
    assert.equal(depositAfter, before.depositAvailable, "FAIL: collecting profit unexpectedly changed the deposit balance.");
    pass = true;
  } catch (error) {
    result = {
      ...result,
      error: error instanceof Error ? error.message : String(error),
      ...(serverLogFile ? { serverLogFile } : {}),
    };
  } finally {
    // Intentionally keep the isolated local server running after the test.
    // This script must never shut down the user's existing dev server.
    if (mongoConnected) await mongoose.disconnect().catch(() => {});
  }

  console.log(JSON.stringify({
    result: pass ? "PASS" : "FAIL",
    ...(serverUrl ? { localTestServer: serverUrl, serverRemainsRunning: true } : {}),
    ...(serverLogFile ? { serverLogFile } : {}),
    ...result
  }, null, 2));
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
