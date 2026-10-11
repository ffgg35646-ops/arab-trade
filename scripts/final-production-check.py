
from pathlib import Path
import json
import os

ROOT = Path.cwd()

groups = {
    "spot": [
        "lib/exchange-math.ts",
        "lib/exchange-settlement.ts",
        "lib/spot-settlement.ts",
        "lib/fee-engine.ts",
        "lib/idempotency.ts",
    ],
    "futures": [
        "lib/futures-engine-core.ts",
        "lib/futures-risk.ts",
        "models/FuturesPosition.ts",
        "models/FundingPayment.ts",
        "app/api/futures/orders/route.ts",
        "app/api/futures/funding/route.ts",
    ],
    "margin": [
        "lib/margin-engine-core.ts",
        "lib/margin-interest.ts",
        "models/MarginPosition.ts",
        "models/MarginLoan.ts",
        "app/api/margin/borrow/route.ts",
        "app/api/margin/repay/route.ts",
    ],
    "security": [
        "lib/security.ts",
        "lib/api-hmac.ts",
        "lib/rate-limit.ts",
        "lib/sensitive-storage.ts",
    ],
    "payments": [
        "lib/payment-provider.ts",
        "app/api/payments/create-intent/route.ts",
        "app/api/payments/verify/route.ts",
    ],
    "blockchain": [
        "lib/real-blockchain.ts",
        "app/api/blockchain/verify-deposit/route.ts",
        "app/api/blockchain/create-withdrawal/route.ts",
    ],
    "kyc": [
        "lib/kyc-provider.ts",
        "app/api/kyc/submit/route.ts",
        "app/api/admin/kyc/route.ts",
    ],
    "admin": [
        "app/api/admin/control-summary/route.ts",
        "app/api/admin/verification/route.ts",
        "app/api/admin/payment/route.ts",
        "app/api/admin/subaccounts/route.ts",
        "app/api/admin/risk/route.ts",
    ],
}

result = {}
missing = []

for group, files in groups.items():
    result[group] = {}

    for rel in files:
        ok = (ROOT / rel).exists()
        result[group][rel] = ok

        if not ok:
            missing.append(rel)

present = sum(
    1
    for group in result.values()
    for value in group.values()
    if value
)

total = sum(len(group) for group in result.values())

result["summary"] = {
    "present": present,
    "total": total,
    "coverage": round(
        present * 100 / total,
        2
    ) if total else 100,
    "missing": missing
}

out = ROOT / "final-production-check.json"

out.write_text(
    json.dumps(
        result,
        ensure_ascii=False,
        indent=2
    ),
    encoding="utf-8"
)

print(f"Files: {present}/{total}")
print(f"Coverage: {result['summary']['coverage']}%")
print(f"Missing: {len(missing)}")

for item in missing:
    print("MISSING:", item)

print("Report:", out)

raise SystemExit(1 if missing else 0)
