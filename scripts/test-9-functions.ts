
import {
  calculateTradingFee,
  calculateReceiveAmount
} from "@/lib/fee-engine";

import {
  unrealizedPnl,
  fundingPayment,
  isLiquidatable,
  liquidationPrice
} from "@/lib/futures-risk";

import {
  calculateMarginInterest
} from "@/lib/margin-interest";

import {
  createHmacSignature,
  timingSafeEqualHex
} from "@/lib/api-hmac";

let pass = 0;
let fail = 0;

function check(
  name: string,
  value: boolean,
  actual?: unknown
) {
  if (value) {
    pass++;
    console.log(
      `[PASS] ${name}${actual !== undefined ? ` => ${actual}` : ""}`
    );
  } else {
    fail++;
    console.log(
      `[FAIL] ${name}${actual !== undefined ? ` => ${actual}` : ""}`
    );
  }
}

const fee = calculateTradingFee(1000, 0.1);
check("Trading fee", fee === 1, fee);

const receive = calculateReceiveAmount(1000, fee);
check("Receive after fee", receive === 999, receive);

const longPnl = unrealizedPnl(
  "long",
  100,
  110,
  10
);
check("Futures long PnL", longPnl === 100, longPnl);

const shortPnl = unrealizedPnl(
  "short",
  100,
  90,
  10
);
check("Futures short PnL", shortPnl === 100, shortPnl);

const funding = fundingPayment(10000, 0.0001);
check("Funding", funding === 1, funding);

check(
  "Liquidation boolean",
  isLiquidatable(50, 100) === true
);

const liq = liquidationPrice(
  "long",
  100,
  10
);
check(
  "Liquidation price",
  liq > 89 && liq < 91,
  liq
);

const interest = calculateMarginInterest(
  10000,
  10,
  24
);
check(
  "Margin interest 24h",
  interest > 27 && interest < 28,
  interest
);

const signature = createHmacSignature(
  "test-secret",
  "123",
  "POST",
  "/api/test",
  '{"a":1}'
);

check(
  "HMAC signature",
  signature.length === 64
);

check(
  "HMAC safe comparison",
  timingSafeEqualHex(signature, signature)
);

check(
  "HMAC rejects invalid signature",
  !timingSafeEqualHex(signature, "00")
);

console.log();
console.log("==================================================");
console.log("9 FUNCTIONS TEST");
console.log("PASS :", pass);
console.log("FAIL :", fail);
console.log("==================================================");

process.exit(fail === 0 ? 0 : 1);