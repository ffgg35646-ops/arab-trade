
import os
from pathlib import Path

root = Path.cwd()

required = [
    "MONGODB_URI",
]

optional_sensitive = [
    "JWT_SECRET",
    "ADMIN_LEADER_EMAIL",
    "ADMIN_LEADER_PASSWORD",
]

print("ENVIRONMENT AUDIT")
print("=" * 60)

missing = 0

for key in required:
    value = os.environ.get(key)
    ok = bool(value)
    print(f"{key:<30} {'OK' if ok else 'MISSING'}")
    if not ok:
        missing += 1

for key in optional_sensitive:
    value = os.environ.get(key)
    print(f"{key:<30} {'SET' if value else 'NOT SET'}")

print()
print(f"Missing required variables: {missing}")

raise SystemExit(1 if missing else 0)
