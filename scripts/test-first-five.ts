
import {
  validateSpotFill,
  calculateSpotFee
} from "@/lib/spot-engine-validation";

import {
  calculateFuturesPnl,
  calculateMaintenanceMargin,
  shouldLiquidate
} from "@/lib/futures-engine";

import {
  calculateMarginPnl,
  calculateMarginRatio,
  isMarginLiquidatable
} from "@/lib/margin-engine";

let pass = 0;
let fail = 0;

function test(
  name: string,
  condition: boolean,
  actual?: unknown
) {
  if (condition) {
    pass++;
    console.log(
      `[PASS] ${name}` +
      (actual !== undefined ? ` => ${actual}` : "")
    );
  } else {
    fail++;
    console.log(
      `[FAIL] ${name}` +
      (actual !== undefined ? ` => ${actual}` : "")
    );
  }
}

const quote = validateSpotFill(100, 2);
test("Spot quote", quote === 200, quote);

const fee = calculateSpotFee(1000, 0.1);
test("Spot fee", fee === 1, fee);

const fpnl = calculateFuturesPnl(
  "long",
  100,
  110,
  10
);
test("Futures Long PnL", fpnl === 100, fpnl);

const mm = calculateMaintenanceMargin(
  10000,
  0.005
);
test("Futures maintenance margin", mm === 50, mm);

test(
  "Futures liquidation check",
  shouldLiquidate(40, 50) === true
);

const mpnl = calculateMarginPnl(
  "short",
  100,
  90,
  10
);
test("Margin Short PnL", mpnl === 100, mpnl);

const ratio = calculateMarginRatio(
  1200,
  1000
);
test("Margin ratio", ratio === 1.2, ratio);

test(
  "Margin liquidation",
  isMarginLiquidatable(1050, 1000) === true
);

console.log();
console.log("==================================================");
console.log("FIRST FIVE LOCAL TEST");
console.log("PASS :", pass);
console.log("FAIL :", fail);
console.log("==================================================");

process.exit(fail === 0 ? 0 : 1);