import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Node builds without native TypeScript support cannot import .ts files directly.
// Transpile this pure policy module in memory so the tests work with plain node --test.
const policySource = await readFile(new URL("../lib/package-withdrawal-policy.ts", import.meta.url), "utf8");
const policyJavaScript = ts.transpileModule(policySource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const policyUrl = "data:text/javascript;base64," + Buffer.from(policyJavaScript).toString("base64");
const { withdrawalAllowance, referralWithdrawalAllowance, totalWithdrawalAllowance, availableToWithdraw, validateWithdrawal } = await import(policyUrl);

test("daily withdrawal cap equals the package's original activation amount", () => {
  assert.equal(withdrawalAllowance(100, 0), 100);
  assert.equal(availableToWithdraw(3000, withdrawalAllowance(100, 0)), 100);
  assert.equal(validateWithdrawal(300, 100, 3000, withdrawalAllowance(100, 0)), "المتاح للسحب 100 USDT فقط");
});

test("Bronze daily cap stays at 50 even when package refund/earnings balance is higher", () => {
  assert.equal(withdrawalAllowance(50, 0), 50);
  assert.equal(availableToWithdraw(102, withdrawalAllowance(50, 0)), 50);
  assert.equal(validateWithdrawal(100, 100, 102, withdrawalAllowance(50, 0)), "المتاح للسحب 50 USDT فقط");
});

test("withdrawals already made today consume today's cap", () => {
  assert.equal(withdrawalAllowance(100, 0), 100);
  assert.equal(withdrawalAllowance(100, 40), 60);
  assert.equal(withdrawalAllowance(100, 100), 0);
  assert.equal(validateWithdrawal(100, 100, 3000, 0), "تم استنفاد حد السحب اليومي لهذه الباقة");
});

test("referral deposits unlock 50% additional capacity without changing the daily base cap", () => {
  const activation = 100;
  const balanceAfterFirstApprovedWithdrawal = 500;
  const dailyRemaining = withdrawalAllowance(activation, 100);
  const referralRemaining = referralWithdrawalAllowance(1000, 50, 0);
  assert.equal(dailyRemaining, 0);
  assert.equal(referralRemaining, 500);
  assert.equal(totalWithdrawalAllowance(dailyRemaining, referralRemaining), 500);
  assert.equal(availableToWithdraw(balanceAfterFirstApprovedWithdrawal, totalWithdrawalAllowance(dailyRemaining, referralRemaining)), 500);
});

test("referral-backed withdrawal capacity is cumulative and cannot be reused", () => {
  assert.equal(referralWithdrawalAllowance(1000, 50, 0), 500);
  assert.equal(referralWithdrawalAllowance(1000, 50, 100), 400);
  assert.equal(referralWithdrawalAllowance(1000, 50, 500), 0);
  assert.equal(referralWithdrawalAllowance(2000, 50, 500), 500);
});

test("a used daily base limit requires active referral deposits for additional withdrawal", () => {
  assert.equal(
    validateWithdrawal(100, 100, 500, 0, true),
    "لا يمكن طلب سحب إضافي إلا بعد وجود إحالات نشطة بإيداعات معتمدة",
  );
  assert.equal(validateWithdrawal(150, 100, 500, 100, true), "المتاح للسحب 100 USDT فقط");
});

test("referral deposits do not alter the package's normal daily base allowance", () => {
  assert.equal(withdrawalAllowance(100, 0), 100);
  assert.equal(withdrawalAllowance(100, 100), 0);
  assert.equal(referralWithdrawalAllowance(1000, 50, 0), 500);
});

test("minimum withdrawal and actual package balance are still independently enforced", () => {
  assert.match(validateWithdrawal(99, 100, 500, 200), /الحد الأدنى/);
  assert.match(validateWithdrawal(100, 100, 90, 200), /رصيد سحب الباقة/);
});

test("available withdrawal cannot exceed actual package balance", () => {
  assert.equal(availableToWithdraw(76, 500), 76);
  assert.equal(availableToWithdraw(0, 500), 0);
});

test("invalid and fractional-overflow requests are rejected", () => {
  assert.match(validateWithdrawal(-1, 100, 1000, 1000), /غير صالح/);
  assert.match(validateWithdrawal(0.123456789, 0.01, 1000, 1000), /غير صالح/);
});
