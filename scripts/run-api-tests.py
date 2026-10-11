#!/usr/bin/env python3

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
import http.cookiejar
from pathlib import Path

BASE = "http://127.0.0.1:3000"

PASS = 0
FAIL = 0
BLOCKED = 0

def env_value(name):
    text = Path(".env.local").read_text(encoding="utf-8")
    m = re.search(rf"^{re.escape(name)}=(.*)$", text, re.MULTILINE)
    return m.group(1).strip() if m else ""

EMAIL = env_value("ADMIN_LEADER_EMAIL")
PASSWORD = env_value("ADMIN_LEADER_PASSWORD")

COOKIE_FILE = "/tmp/arabtrade-api-tests.cookies"

# يبدأ الاختبار دائمًا بدون جلسة قديمة.
try:
    Path(COOKIE_FILE).unlink()
except FileNotFoundError:
    pass

jar = http.cookiejar.MozillaCookieJar(COOKIE_FILE)

opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(jar)
)

def req(method, path, body=None, auth=True):
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    try:
        response = opener.open(
            urllib.request.Request(
                BASE + path,
                data=data,
                headers=headers,
                method=method,
            ),
            timeout=30,
        )

        raw = response.read().decode("utf-8", errors="replace")

        try:
            payload = json.loads(raw)
        except Exception:
            payload = raw

        return response.status, payload

    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")

        try:
            payload = json.loads(raw)
        except Exception:
            payload = raw

        return e.code, payload

    except Exception as e:
        return 0, str(e)

def record(name, ok, detail="", blocked=False):
    global PASS, FAIL, BLOCKED

    if blocked:
        BLOCKED += 1
        mark = "BLOCKED"
    elif ok:
        PASS += 1
        mark = "PASS"
    else:
        FAIL += 1
        mark = "FAIL"

    print(f"[{mark:<7}] {name}")
    if detail:
        print(f"          {detail}")

def json_brief(data):
    if isinstance(data, dict):
        return json.dumps(data, ensure_ascii=False)[:500]
    return str(data)[:500]

print("=" * 70)
print("ArabTrade - API Integration Test Suite")
print("=" * 70)

if not EMAIL or not PASSWORD:
    print("ERROR: ADMIN_LEADER_EMAIL / ADMIN_LEADER_PASSWORD غير موجودين في .env.local")
    sys.exit(1)

# ------------------------------------------------------------
# 1. Server health / authentication
# ------------------------------------------------------------

status, data = req("GET", "/api/auth/me")
record(
    "Auth بدون جلسة",
    status in (401, 403),
    f"HTTP {status} | {json_brief(data)}"
)

status, data = req(
    "POST",
    "/api/auth/login",
    {
        "identifier": EMAIL,
        "password": PASSWORD,
    },
)

login_ok = (
    status == 200
    and isinstance(data, dict)
    and data.get("success") is True
)

record(
    "تسجيل دخول الأدمن",
    login_ok,
    f"HTTP {status} | {json_brief(data)}"
)

if not login_ok:
    print("\nلا يمكن إكمال الاختبارات المحمية بدون Login.")
    print("تقرير:")
    print(f"PASS={PASS} FAIL={FAIL} BLOCKED={BLOCKED}")
    sys.exit(1)

try:
    jar.save(ignore_discard=True)
except Exception:
    pass

status, data = req("GET", "/api/auth/me")
record(
    "Auth بعد تسجيل الدخول",
    status == 200 and isinstance(data, dict) and data.get("success") is True,
    f"HTTP {status} | {json_brief(data)}"
)

# ------------------------------------------------------------
# 2. Wallet
# ------------------------------------------------------------

status, data = req("GET", "/api/wallet")

wallet_ok = (
    status == 200
    and isinstance(data, dict)
    and data.get("success") is True
    and "wallets" in data
)

record(
    "تحميل المحافظ",
    wallet_ok,
    f"HTTP {status} | {json_brief(data)}"
)

# ------------------------------------------------------------
# 3. Public assets
# ------------------------------------------------------------

status, data = req("GET", "/api/assets")

assets = []
if isinstance(data, dict):
    assets = data.get("assets") or []

assets_ok = status == 200 and isinstance(data, dict) and data.get("success") is True

record(
    "تحميل الأصول",
    assets_ok,
    f"HTTP {status} | عدد الأصول: {len(assets)}"
)

symbols = {
    str(a.get("symbol", "")).upper()
    for a in assets
    if isinstance(a, dict)
}

trading_assets = [
    a for a in assets
    if isinstance(a, dict)
    and a.get("enabled") is True
    and a.get("tradingEnabled") is True
]

if len(trading_assets) == 0:
    record(
        "جاهزية أصول التداول",
        False,
        "لا توجد أصول مفعلة للتداول في قاعدة البيانات.",
        blocked=True,
    )
else:
    record(
        "جاهزية أصول التداول",
        True,
        f"عدد الأصول القابلة للتداول: {len(trading_assets)}"
    )

# ------------------------------------------------------------
# 4. Order book / trades
# ------------------------------------------------------------

status, data = req("GET", "/api/orderbook?symbol=BTCUSDT")

record(
    "Order Book",
    status == 200 and isinstance(data, dict) and data.get("success") is True,
    f"HTTP {status} | {json_brief(data)}"
)

status, data = req("GET", "/api/trades?symbol=BTCUSDT")

record(
    "Trade History",
    status == 200 and isinstance(data, dict) and data.get("success") is True,
    f"HTTP {status} | {json_brief(data)}"
)

# ------------------------------------------------------------
# 5. Orders
# ------------------------------------------------------------

status, data = req("GET", "/api/orders")

record(
    "تحميل أوامر المستخدم",
    status == 200 and isinstance(data, dict) and data.get("success") is True,
    f"HTTP {status} | {json_brief(data)}"
)

# محاولة إيجابية فقط إذا كان الأصل موجودًا.
if "BTC" in symbols and "USDT" in symbols and trading_assets:
    status, data = req(
        "POST",
        "/api/orders",
        {
            "symbol": "BTCUSDT",
            "side": "buy",
            "type": "limit",
            "price": 1,
            "quantity": 1,
        },
    )

    record(
        "إنشاء أمر Spot",
        status in (201, 400),
        f"HTTP {status} | {json_brief(data)}"
    )
else:
    record(
        "إنشاء أمر Spot",
        False,
        "BLOCKED: BTC/USDT غير متوفرين كأصول تداول مفعلة.",
        blocked=True,
    )

# ------------------------------------------------------------
# 6. Security / 2FA
# ------------------------------------------------------------

status, data = req("GET", "/api/account/2fa")

record(
    "حالة 2FA",
    status == 200 and isinstance(data, dict) and data.get("success") is True,
    f"HTTP {status} | {json_brief(data)}"
)

# ------------------------------------------------------------
# 7. Notification preferences
# ------------------------------------------------------------

status, data = req("GET", "/api/notifications/preferences")

record(
    "تفضيلات الإشعارات",
    status == 200 and isinstance(data, dict) and data.get("success") is True,
    f"HTTP {status} | {json_brief(data)}"
)

# ------------------------------------------------------------
# 8. Referral / rewards
# ------------------------------------------------------------

status, data = req("GET", "/api/referral")

record(
    "الإحالة",
    status == 200 and isinstance(data, dict) and data.get("success") is True,
    f"HTTP {status} | {json_brief(data)}"
)

status, data = req("GET", "/api/referral/commissions")

record(
    "عمولات الإحالة",
    status == 200 and isinstance(data, dict) and data.get("success") is True,
    f"HTTP {status} | {json_brief(data)}"
)

status, data = req("GET", "/api/rewards")

record(
    "المكافآت",
    status == 200 and isinstance(data, dict) and data.get("success") is True,
    f"HTTP {status} | {json_brief(data)}"
)

# ------------------------------------------------------------
# 9. Account reports / ledger / sessions
# ------------------------------------------------------------

for name, path in [
    ("Ledger", "/api/account/ledger"),
    ("Statement", "/api/account/statement"),
    ("Reports", "/api/account/reports"),
    ("Sessions", "/api/account/sessions"),
]:
    status, data = req("GET", path)

    record(
        name,
        status == 200 and isinstance(data, dict) and data.get("success") is True,
        f"HTTP {status} | {json_brief(data)}"
    )

# ------------------------------------------------------------
# 10. Margin / Futures
# ------------------------------------------------------------

for name, path in [
    ("Margin Positions", "/api/margin/positions"),
    ("Futures Positions", "/api/futures/positions"),
]:
    status, data = req("GET", path)

    record(
        name,
        status == 200 and isinstance(data, dict) and data.get("success") is True,
        f"HTTP {status} | {json_brief(data)}"
    )

# ------------------------------------------------------------
# 11. Admin endpoints
# ------------------------------------------------------------

admin_tests = [
    ("Admin Settings", "GET", "/api/admin/settings", None),
    ("Admin Assets", "GET", "/api/admin/assets", None),
    ("Admin Users", "GET", "/api/admin/users", None),
    ("Admin Deposits", "GET", "/api/admin/deposits", None),
    ("Admin Withdrawals", "GET", "/api/admin/withdrawals", None),
    ("Admin Rewards", "GET", "/api/admin/rewards", None),
    ("Admin Audit", "GET", "/api/admin/audit", None),
]

for name, method, path, body in admin_tests:
    status, data = req(method, path, body)

    record(
        name,
        status == 200 and isinstance(data, dict) and data.get("success") is True,
        f"HTTP {status} | {json_brief(data)}"
    )

# ------------------------------------------------------------
# 12. Verify logout actually invalidates the authenticated call
# ------------------------------------------------------------

status, data = req("POST", "/api/auth/logout", {})

record(
    "Logout",
    status in (200, 204),
    f"HTTP {status} | {json_brief(data)}"
)

status, data = req("GET", "/api/auth/me")

record(
    "رفض الجلسة بعد Logout",
    status in (401, 403),
    f"HTTP {status} | {json_brief(data)}"
)

# ------------------------------------------------------------
# Final summary
# ------------------------------------------------------------

print("\n" + "=" * 70)
print("TEST SUMMARY")
print("=" * 70)
print(f"PASS     : {PASS}")
print(f"FAIL     : {FAIL}")
print(f"BLOCKED  : {BLOCKED}")
print("=" * 70)

if FAIL == 0:
    print("النتيجة: لا توجد أخطاء API في الاختبارات المنفذة.")
else:
    print("النتيجة: توجد اختبارات فشلت وتحتاج إصلاح.")

if BLOCKED:
    print("هناك اختبارات محجوبة بسبب نقص بيانات تشغيلية فعلية، وليس بسبب نجاح/فشل API.")

sys.exit(1 if FAIL else 0)
