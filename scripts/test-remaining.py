
#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE = os.environ.get("ARABTRADE_BASE_URL", "http://127.0.0.1:3000")

def req(path, method="GET", body=None, headers=None):
    headers = headers or {}
    data = None

    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"

    r = Request(
        BASE + path,
        method=method,
        headers=headers,
        data=data
    )

    try:
        with urlopen(r, timeout=10) as response:
            raw = response.read().decode("utf-8")
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = raw
            return response.status, parsed
    except HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = raw
        return e.code, parsed
    except URLError as e:
        return 0, {"error": str(e)}

tests = [
    ("health", "/api/health", "GET", None, {200}),
    ("assets", "/api/assets", "GET", None, {200}),
    ("market", "/api/market", "GET", None, {200}),
    ("wallet-auth-check", "/api/wallet", "GET", None, {401, 403}),
    ("orders-auth-check", "/api/orders", "GET", None, {401, 403}),
    ("trades-auth-check", "/api/trades?symbol=BTCUSDT", "GET", None, {401, 403}),
    ("orderbook", "/api/orderbook?symbol=BTCUSDT", "GET", None, {200}),
    ("margin-position-auth-check", "/api/margin/positions", "GET", None, {401, 403}),
    ("futures-position-auth-check", "/api/futures/positions", "GET", None, {401, 403}),
    ("futures-order-auth-check", "/api/futures/orders", "GET", None, {401, 403}),
    ("verification-admin-endpoint", "/api/admin/verification", "GET", None, {200}),
    ("payment-admin-endpoint", "/api/admin/payment", "GET", None, {200}),
    ("subaccount-admin-endpoint", "/api/admin/subaccounts", "GET", None, {200}),
]

passed = 0
failed = 0

for name, path, method, body, expected in tests:
    status, payload = req(path, method, body)
    if status in expected:
        print(f"PASS : {name:<38} HTTP {status}")
        passed += 1
    else:
        print(f"FAIL : {name:<38} HTTP {status} expected={sorted(expected)}")
        print(f"       {payload}")
        failed += 1

print()
print("=" * 70)
print(f"PASS : {passed}")
print(f"FAIL : {failed}")
print("=" * 70)

sys.exit(1 if failed else 0)
