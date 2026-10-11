
import subprocess
import sys
import os
import urllib.request
import socket

ROOT = os.getcwd()
BASE = os.environ.get(
    "ARABTRADE_BASE_URL",
    "http://127.0.0.1:3000"
)

def run(name, cmd):
    print()
    print("=" * 78)
    print(name)
    print("=" * 78)
    print("$", " ".join(cmd))

    p = subprocess.run(cmd, cwd=ROOT)

    print(
        f"{name}:",
        "PASS" if p.returncode == 0 else "FAIL"
    )

    return p.returncode

def mongo_ok():
    try:
        s = socket.create_connection(
            ("127.0.0.1", 27017),
            timeout=2
        )
        s.close()
        return True
    except Exception:
        return False

if not mongo_ok():
    print("MongoDB: FAIL - 127.0.0.1:27017 is unavailable")
    sys.exit(20)

print("MongoDB: PASS")

checks = [
    ("ENVIRONMENT", ["python3", "scripts/environment-audit.py"]),
    ("SECURITY AUDIT", ["python3", "scripts/security-audit.py"]),
    ("TYPESCRIPT", ["npx", "tsc", "--noEmit"]),
    ("PRODUCTION BUILD", ["npm", "run", "build"]),
    ("COMPLETION AUDIT", ["python3", "scripts/audit-completion.py"]),
]

for name, cmd in checks:
    if run(name, cmd) != 0:
        sys.exit(1)

server = None
started = False

def healthy():
    try:
        with urllib.request.urlopen(
            BASE + "/api/health",
            timeout=2
        ) as r:
            return r.status == 200
    except Exception:
        return False

if not healthy():
    print()
    print("Starting Next.js...")
    server = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True
    )
    started = True

    import time

    for _ in range(30):
        if healthy():
            break
        time.sleep(1)
    else:
        print("Next.js: FAIL")
        server.terminate()
        sys.exit(2)

    print("Next.js: PASS")
else:
    print("Next.js: ALREADY RUNNING")

live_checks = [
    ("API SMOKE", ["python3", "scripts/test-remaining.py"]),
    ("SPOT 24/24", ["npx", "tsx", "scripts/dev-full-trading-test.ts"]),
    ("MARGIN + FUTURES", [
        "bash",
        "-lc",
        'MONGODB_URI="$MONGODB_URI" npx tsx scripts/test-margin-futures.ts'
    ]),
]

for name, cmd in live_checks:
    if run(name, cmd) != 0:
        if started and server:
            server.terminate()
        sys.exit(3)

# Risk endpoint must at least respond for authenticated route;
# unauthenticated response is expected to be 401.
try:
    with urllib.request.urlopen(
        BASE + "/api/risk",
        timeout=5
    ) as r:
        print("RISK API: PASS", r.status)
except urllib.error.HTTPError as e:
    if e.code in (401, 403):
        print("RISK API AUTH CHECK: PASS", e.code)
    else:
        print("RISK API: FAIL", e.code)
        if started and server:
            server.terminate()
        sys.exit(4)
except Exception as e:
    print("RISK API: FAIL", e)
    if started and server:
        server.terminate()
    sys.exit(4)

if started and server:
    server.terminate()

print()
print("=" * 78)
print("FINAL RESULT: ALL CHECKS PASSED")
print("=" * 78)
print("MongoDB              : PASS")
print("Environment          : PASS")
print("Security Audit       : PASS")
print("TypeScript            : PASS")
print("Production Build      : PASS")
print("Completion Audit      : PASS")
print("API Smoke             : PASS")
print("Spot Trading          : PASS 24/24")
print("Margin + Futures      : PASS")
print("Risk API              : PASS")
print("=" * 78)
