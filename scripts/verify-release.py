"""Verify the pinned contract/wire hashes and version metadata of this SDK release."""
from pathlib import Path
import hashlib, json

root = Path(__file__).resolve().parents[1]
m = json.loads((root / "release-manifest.json").read_text())
pkg = json.loads((root / "package.json").read_text())
contract = json.loads((root / "contract.json").read_text())
for name, expected in m["files"].items():
    actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
    assert actual == expected, f"Pinned source changed: {name} (a shipped wire never changes; cut a new version)"
    print(f"verified {name} {actual}")
assert m["package"] == pkg["name"] == "@busymate/ai-web"
assert m["version"] == pkg["version"], "version mismatch"
assert f'SDK_VERSION = "{pkg["version"]}"' in (root / "src" / "version.ts").read_text(), "src/version.ts mismatch"
assert m["wire"]["contract"] == contract["version"] == 1
assert m["wire"]["bridge"] == contract["bridge"] == "busymate-ai-v1"
assert m["wire"]["channel"] == contract["channel"] == "embed"
assert m["wire"]["identity"] == contract["identityContract"] == "busymate.identity/v1"
assert not pkg.get("dependencies"), "zero runtime dependencies"
example = json.loads((root / "example-app" / "react" / "package.json").read_text())
assert example["dependencies"]["@busymate/ai-web"] == "file:../..", "the React example must consume this SDK"
assert "../../dist/busymate-ai-web.iife.js" in (root / "example-app" / "plain" / "index.html").read_text(), "the plain example must load this SDK's script-tag build"
assert f"## {pkg['version']}" in (root / "CHANGELOG.md").read_text(), "CHANGELOG entry missing"
print(f"release {m['version']} verified")
