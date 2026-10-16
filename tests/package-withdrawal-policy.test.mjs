import assert from "node:assert/strict";
import test from "node:test";
import { withdrawalAllowance, availableToWithdraw, validateWithdrawal } from "../lib/package-withdrawal-policy.ts";
test("initial package cap is activation amount",()=>{assert.equal(withdrawalAllowance(200,0,0),200);assert.equal(availableToWithdraw(300,200),200);assert.equal(validateWithdrawal(300,100,300,200),"المتاح للسحب 200 USDT فقط");});
test("minimum and real balance are independently required",()=>{assert.match(validateWithdrawal(99,100,500,200),/الحد الأدنى/);assert.match(validateWithdrawal(100,100,90,200),/رصيد سحب الباقة/);});
test("ten active referrals at 100 unlock exactly 500 additional allowance",()=>{assert.equal(withdrawalAllowance(200,1000,200),500);assert.equal(withdrawalAllowance(200,1000,400),300);assert.equal(validateWithdrawal(400,100,500,300),"المتاح للسحب 300 USDT فقط");});
test("spent referral allowance does not regenerate without new referrals",()=>{assert.equal(withdrawalAllowance(200,1000,700),0);assert.match(validateWithdrawal(100,100,500,0),/إحالات نشطة جديدة/);});
test("referrals never increase package balance",()=>{assert.equal(availableToWithdraw(76,500),76);assert.equal(availableToWithdraw(0,500),0);});
test("invalid and fractional overflow requests are rejected",()=>{assert.match(validateWithdrawal(-1,100,1000,1000),/غير صالح/);assert.match(validateWithdrawal(0.123456789,0.01,1000,1000),/غير صالح/);});

test("referral capacity starts only after initial activation allowance is consumed",()=>{assert.equal(withdrawalAllowance(200,1000,0),200);assert.equal(withdrawalAllowance(200,1000,100),100);assert.equal(withdrawalAllowance(200,1000,200),500);});
