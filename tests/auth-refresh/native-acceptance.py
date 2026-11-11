#!/usr/bin/env python3
"""Exercise published plugin routes in disposable native-client profiles.

No model calls, live credentials, provider logins, or user plugin settings are used.
Run explicitly: python3 tests/auth-refresh/native-acceptance.py --report /tmp/native.json
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import stat
import subprocess
import tempfile
import time


ROOT = Path(os.environ.get("AUTH_REFRESH_SOURCE", Path(__file__).resolve().parents[3] / "auth-refresh"))
PAYLOAD = [
    "auth-refresh.lock.json", "scripts/ensure-auth-refresh.sh",
    "scripts/runtime-install.py", "skills/auth-refresh/SKILL.md",
    "skills/auth-refresh/references/workflow.md",
    "skills/auth-refresh/references/capabilities.md", "agents/auth-refresh.md",
]


def exercise(client, route, ref, shared_source=None):
    record = {"client": client, "route": route, "steps": []}
    with tempfile.TemporaryDirectory(prefix="auth-refresh-native-") as scratch:
        base = Path(scratch)
        env = dict(os.environ, CODEX_HOME=str(base / "codex"),
                   CLAUDE_CONFIG_DIR=str(base / "claude"),
                   DISABLE_AUTOUPDATER="1", XDG_CACHE_HOME=str(base / "cache"),
                   AUTH_REFRESH_CONFIG=str(base / "config.json"),
                   AUTH_REFRESH_HOME=str(base / "lane-state"))
        for name in ("codex", "claude", "lane-state"):
            (base / name).mkdir(mode=0o700)
        preserved = {
            base / "config.json": b'{"sentinel":"preserve"}\n',
            base / "creds": b"[fixture]\npass=fixture-only\n",
            base / "lane-state/sessions.json": b'{"fixture":"private-state"}\n',
        }
        for path, value in preserved.items():
            path.write_bytes(value)
            path.chmod(0o600)

        def run(args, expected=0, timeout=100, extra_env=None):
            started = time.monotonic()
            result = subprocess.run(args, cwd=base, env=env | (extra_env or {}),
                                    stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=timeout)
            # Only disposable profiles and fixture data appear in these outputs.
            record["steps"].append({"command": [str(a).replace(scratch, "<profile>") for a in args],
                                    "exit": result.returncode,
                                    "seconds": round(time.monotonic() - started, 2),
                                    "stdout": result.stdout.replace(scratch, "<profile>"),
                                    "stderr": result.stderr.replace(scratch, "<profile>")})
            if result.returncode != expected:
                raise AssertionError(f"{args[:4]} exited {result.returncode}: {result.stderr}")
            return result.stdout

        def assert_private_state():
            for path, value in preserved.items():
                assert path.read_bytes() == value, f"private state changed: {path.name}"
                assert stat.S_IMODE(path.stat().st_mode) == 0o600, path.name

        try:
            repo = "michielvha/auth-refresh" if route == "standalone" else "michielvha/vh-adlc"
            name = "auth-refresh" if route == "standalone" else "vhco-tools"
            local_shared = route == "vhco-tools" and shared_source is not None
            source = str(shared_source.resolve()) if local_shared else (
                repo if client == "codex" else f"https://github.com/{repo}.git")
            if route == "vhco-tools" and client == "claude" and not local_shared:
                source += "#" + ref
            add = [client, "plugin", "marketplace", "add", source]
            if route == "vhco-tools" and client == "codex" and not local_shared:
                add += ["--ref", ref]
            run(add)
            plugin = "auth-refresh@" + name
            run([client, "plugin", "add" if client == "codex" else "install", plugin])
            inventory = json.loads(run([client, "plugin", "list", "--json"]))
            record["inventory"] = json.loads(json.dumps(inventory).replace(scratch, "<profile>"))
            serialized = json.dumps(inventory)
            assert "auth-refresh" in serialized, "plugin missing from native inventory"
            if client == "claude":
                assert [i["id"] for i in inventory] == [plugin], "unrelated plugin installed"
            installers = [p for p in base.rglob("ensure-auth-refresh.sh") if "/plugins/cache/" in str(p)]
            assert len(installers) == 1, f"expected one installed plugin, found {len(installers)}"
            installed = installers[0].parent.parent
            record["payload_sha256"] = {}
            for path in PAYLOAD:
                data = (installed / path).read_bytes()
                assert data == (ROOT / path).read_bytes(), f"canonical payload differs: {path}"
                record["payload_sha256"][path] = hashlib.sha256(data).hexdigest()
            lock = json.loads((installed / "auth-refresh.lock.json").read_text())
            binary = run(["bash", str(installers[0])], timeout=160).strip()
            assert Path(binary).is_relative_to(base / "cache"), "runtime escaped disposable cache"
            assert run([binary, "version"]).strip() == "auth-refresh " + lock["version"]
            assert run(["bash", str(installers[0])]).strip() == binary, "cache reuse failed"
            probe = base / "probe.json"
            probe.write_text(json.dumps({"identities": [{"name": "fixture-token", "type": "http_token",
                                                        "file": str(base / "absent-token"),
                                                        "url": "https://example.invalid/token"}]}))
            output = run([binary, "check", "--json"], expected=1,
                         extra_env={"AUTH_REFRESH_CONFIG": str(probe)})
            assert json.loads(output)[0]["status"] == "MISSING", output
            assert_private_state()
            if not (local_shared and client == "codex"):
                run([client, "plugin", "marketplace", "upgrade" if client == "codex" else "update", name])
            run([client, "plugin", "add" if client == "codex" else "update", plugin])
            assert_private_state()
            run([client, "plugin", "remove" if client == "codex" else "uninstall", plugin])
            assert_private_state()
            record["private_state_preserved"] = True
            record["result"] = "pass"
        except (OSError, ValueError, AssertionError, subprocess.SubprocessError) as error:
            record["result"] = "fail"
            record["error"] = str(error).replace(scratch, "<profile>")
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--shared-ref", default="feat/portable-auth-refresh")
    parser.add_argument("--shared-source", type=Path, help="Test a local candidate marketplace before publication")
    parser.add_argument("--client", choices=["claude", "codex", "both"], default="both")
    args = parser.parse_args()
    clients = [args.client] if args.client != "both" else ["claude", "codex"]
    report = {"platform": platform.platform(), "source": str(ROOT), "clients": {}, "cases": []}
    for client in clients:
        assert shutil.which(client), f"{client} is unavailable"
        report["clients"][client] = subprocess.check_output([client, "--version"], text=True).strip()
        for route in ("standalone", "vhco-tools"):
            result = exercise(client, route, args.shared_ref, args.shared_source)
            report["cases"].append(result)
            print(f"{client} {route}: {result['result']}", flush=True)
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, indent=2) + "\n")
    return int(any(case["result"] != "pass" for case in report["cases"]))


if __name__ == "__main__":
    raise SystemExit(main())
