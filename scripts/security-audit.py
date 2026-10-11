
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]

routes = list((ROOT / "app/api").rglob("route.ts"))
models = list((ROOT / "models").glob("*.ts"))

findings = []

for p in routes:
    text = p.read_text(encoding="utf-8", errors="ignore")
    rel = str(p.relative_to(ROOT))

    if "request.json()" in text and "JSON" not in text:
        pass

    if "Math.random()" in text:
        findings.append({
            "file": rel,
            "severity": "medium",
            "issue": "Math.random used in API"
        })

    if re.search(r'console\.log\(.*password', text, re.I):
        findings.append({
            "file": rel,
            "severity": "high",
            "issue": "possible password logging"
        })

    if "txHash" in text and "Duplicate" not in text and "findOne" not in text:
        findings.append({
            "file": rel,
            "severity": "medium",
            "issue": "txHash route should verify duplicate protection"
        })

    if "private" in text.lower() and "crypto" not in text:
        findings.append({
            "file": rel,
            "severity": "low",
            "issue": "review sensitive-data encryption"
        })

result = {
    "routes": len(routes),
    "models": len(models),
    "findings": findings
}

out = ROOT / "security-audit.json"
out.write_text(
    json.dumps(result, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"API routes: {len(routes)}")
print(f"Models: {len(models)}")
print(f"Findings: {len(findings)}")

for item in findings:
    print(
        f"[{item['severity'].upper()}] "
        f"{item['file']} - {item['issue']}"
    )

print(f"Report: {out}")
