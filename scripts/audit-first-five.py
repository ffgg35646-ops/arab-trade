
from pathlib import Path
import json

ROOT = Path.cwd()

groups = {
    "spot": [
        "lib/spot-engine-validation.ts",
        "lib/fee-engine.ts",
        "lib/idempotency.ts"
    ],
    "futures": [
        "lib/futures-engine.ts",
        "lib/futures-risk.ts",
        "app/api/futures/orders/route.ts"
    ],
    "margin": [
        "lib/margin-engine.ts",
        "lib/margin-interest.ts",
        "app/api/margin/borrow/route.ts",
        "app/api/margin/repay/route.ts"
    ],
    "blockchain": [
        "lib/real-blockchain.ts",
        "app/api/blockchain/verify-deposit/route.ts",
        "app/api/blockchain/create-withdrawal/route.ts"
    ],
    "kyc": [
        "lib/kyc-provider.ts",
        "app/api/kyc/submit/route.ts",
        "app/api/admin/kyc/route.ts"
    ]
}

missing = []
result = {}

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
    "coverage": round(present * 100 / total, 2),
    "missing": missing
}

out = ROOT / "first-five-audit.json"
out.write_text(
    json.dumps(result, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"Present : {present}/{total}")
print(f"Coverage: {result['summary']['coverage']}%")
print(f"Missing : {len(missing)}")
print(f"Report  : {out}")

raise SystemExit(1 if missing else 0)
