
from pathlib import Path
import json

ROOT = Path.cwd()

required = {
    "spot": [
        "lib/fee-engine.ts",
        "lib/trade-validation.ts",
        "lib/idempotency.ts"
    ],
    "futures": [
        "lib/futures-risk.ts",
        "models/FundingPayment.ts",
        "app/api/futures/funding/route.ts"
    ],
    "margin": [
        "lib/margin-interest.ts",
        "app/api/margin/interest/route.ts"
    ],
    "blockchain": [
        "lib/blockchain-gateway.ts"
    ],
    "kyc": [
        "app/api/admin/kyc/route.ts"
    ],
    "payments": [
        "app/api/admin/payments/review/route.ts"
    ],
    "security": [
        "lib/api-hmac.ts",
        "lib/rate-limit.ts",
        "app/api/readiness/route.ts"
    ],
    "admin": [
        "app/api/admin/risk/route.ts"
    ],
    "tests": [
        "scripts/test-9-functions.ts",
        "scripts/test-everything.py"
    ]
}

result = {}
missing = []

for group, files in required.items():
    result[group] = {}
    for rel in files:
        exists = (ROOT / rel).exists()
        result[group][rel] = exists
        if not exists:
            missing.append(rel)

present = sum(
    1
    for group in result.values()
    for ok in group.values()
    if ok
)

total = sum(len(group) for group in result.values())

summary = {
    "present": present,
    "total": total,
    "coverage": round((present / total) * 100, 2) if total else 100,
    "missing": missing
}

result["summary"] = summary

out = ROOT / "final-9-functions-audit.json"
out.write_text(
    json.dumps(result, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"Present : {present}/{total}")
print(f"Coverage: {summary['coverage']}%")
print(f"Missing : {len(missing)}")
print(f"Report  : {out}")

raise SystemExit(1 if missing else 0)
