import assert from "node:assert/strict";
import test from "node:test";
import { withdrawalAllowance, availableToWithdraw, validateWithdrawal } from "../lib/package-withdrawal-policy.ts";

test("first withdrawal phase is capped by the original package activation amount", () => {
  assert.equal(withdrawalAllowance(100, 0), 100);
  assert.equal(availableToWithdraw(3000, withdrawalAllowance(100, 0)), 100);
  assert.equal(validateWithdrawal(300, 100, 3000, withdrawalAllowance(100, 0)), "المتاح للسحب 100 USDT فقط");
});

test("bronze activation amount remains the cap even when refund/earnings balance is higher", () => {
  assert.equal(withdrawalAllowance(50, 0), 50);
  assert.equal(availableToWithdraw(102, withdrawalAllowance(50, 0)), 50);
  assert.equal(validateWithdrawal(100, 100, 102, withdrawalAllowance(50, 0)), "المتاح للسحب 50 USDT فقط");
});

test("withdrawal cap is cumulative: pending and approved amounts consume it; rejected amounts do not", () => {
  assert.equal(withdrawalAllowance(100, 0), 100);
  assert.equal(withdrawalAllowance(100, 40), 60);
  assert.equal(withdrawalAllowance(100, 100), 0);
  assert.equal(validateWithdrawal(100, 100, 3000, 0), "تم استنفاد حد السحب الحالي لهذه الباقة");
});

test("earnings, refunds, and referral deposits do not increase the first-phase cap", () => {
  const activation = 200;
  const used = 200;
  const packageBalanceAfterProfitsAndRefunds = 3000;
  const activeReferralDeposits = 10000;
  // Referral deposits are intentionally irrelevant to the first-phase policy.
  assert.equal(withdrawalAllowance(activation, used), 0);
  assert.equal(availableToWithdraw(packageBalanceAfterProfitsAndRefunds, withdrawalAllowance(activation, used)), 0);
  assert.equal(activeReferralDeposits, 10000);
});

test("minimum withdrawal and actual package balance are still independently enforced", () => {
  assert.match(validateWithdrawal(99, 100, 500, 200), /الحد الأدنى/);
  assert.match(validateWithdrawal(100, 100, 90, 200), /رصيد سحب الباقة/);
});

test("package earnings cannot make available withdrawal exceed the actual package balance", () => {
  assert.equal(availableToWithdraw(76, 500), 76);
  assert.equal(availableToWithdraw(0, 500), 0);
});

test("invalid and fractional-overflow requests are rejected", () => {
  assert.match(validateWithdrawal(-1, 100, 1000, 1000), /غير صالح/);
  assert.match(validateWithdrawal(0.123456789, 0.01, 1000, 1000), /غير صالح/);
});
