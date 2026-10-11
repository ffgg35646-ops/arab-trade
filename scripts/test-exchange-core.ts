
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

let pass = 0;
let fail = 0;

function t(name: string, ok: boolean, value?: unknown) {
  if (ok) {
    pass++;
    console.log(
      `[PASS] ${name}` +
      (value !== undefined ? ` => ${value}` : "")
    );
  } else {
    fail++;
    console.log(
      `[FAIL] ${name}` +
      (value !== undefined ? ` => ${value}` : "")
    );
  }
}

const n = notional(100, 2);
t("Spot notional", n === 200, n);

const f = fee(10000, 0.1);
t("Spot fee", f === 10, f);

const fp = calculateFuturesPnl(
  "long",
  100,
  110,
  5
);
t("Futures long PnL", fp === 50, fp);

const mm = calculateMaintenanceMargin(
  10000,
  0.005
);
t("Maintenance margin", mm === 50, mm);

const liq = calculateLiquidationPrice(
  "long",
  100,
  10
);
t("Liquidation price", liq > 89 && liq < 90, liq);

t(
  "Liquidation trigger",
  shouldLiquidate(40, 50)
);

const borrowed = calculateBorrowed(
  100,
  10,
  5
);
t(
  "Margin borrowed",
  borrowed === 800,
  borrowed
);

const interest = calculateInterest(
  10000,
  10,
  24
);
t(
  "Margin interest",
  interest > 2.73 && interest < 2.75,
  interest
);

const ratio = calculateRatio(
  1100,
  1000
);
t("Margin ratio", ratio === 1.1, ratio);

t(
  "Margin liquidation",
  liquidatable(1100, 1000)
);

console.log();
console.log("==================================================");
console.log("EXCHANGE CORE TEST");
console.log("PASS :", pass);
console.log("FAIL :", fail);
console.log("==================================================");

process.exit(
  fail === 0 ? 0 : 1
);