#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

checks = {
    "auth": [
        "app/api/auth/login/route.ts",
        "app/api/auth/register/route.ts",
        "app/api/auth/me/route.ts",
        "app/api/auth/logout/route.ts",
    ],
    "wallet": [
        "app/api/wallet/route.ts",
        "app/api/transfers/route.ts",
    ],
    "spot": [
        "app/api/orders/route.ts",
        "app/api/orders/cancel/route.ts",
        "app/api/orders/match/route.ts",
        "app/api/orderbook/route.ts",
        "app/api/trades/route.ts",
    ],
    "withdraw": [
        "app/api/withdrawals/route.ts",
        "app/api/admin/withdrawals/route.ts",
    ],
    "deposit": [
        "app/api/deposits/route.ts",
        "app/api/admin/deposits/route.ts",
    ],
    "security": [
        "app/api/account/2fa/route.ts",
        "app/api/account/sessions/route.ts",
        "app/api/account/security/password/route.ts",
        "app/api/account/security/settings/route.ts",
        "app/api/account/api-keys/route.ts",
    ],
    "margin": [
        "app/api/margin/positions/route.ts",
        "app/api/margin/borrow/route.ts",
        "app/api/margin/repay/route.ts",
        "app/api/margin/loans/route.ts",
    ],
    "futures": [
        "app/api/futures/positions/route.ts",
        "app/api/futures/orders/route.ts",
        "app/api/futures/orders/cancel/route.ts",
    ],
    "admin": [
        "app/api/admin/settings/route.ts",
        "app/api/admin/assets/route.ts",
        "app/api/admin/users/route.ts",
        "app/api/admin/verification/route.ts",
        "app/api/admin/payment/route.ts",
        "app/api/admin/subaccounts/route.ts",
    ],
}

result = {}

for section, paths in checks.items():
    result[section] = {
        p: (ROOT / p).exists()
        for p in paths
    }

all_paths = [p for section in checks.values() for p in section]
existing = sum((ROOT / p).exists() for p in all_paths)
total = len(all_paths)

result["summary"] = {
    "existing": existing,
    "total": total,
    "coverage_percent": round(existing * 100 / total, 2) if total else 100
}

out = ROOT / "completion-audit-final.json"
out.write_text(
    json.dumps(result, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"Existing: {existing}/{total}")
print(f"Coverage: {result['summary']['coverage_percent']}%")
print(f"Report: {out}")
