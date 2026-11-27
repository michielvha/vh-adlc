import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import subprocess
import sys
import threading

root = Path(__file__).resolve().parent
adb = os.environ.get("ANDROID_ADB", "adb")
rows = subprocess.check_output([adb, "devices"], text=True).splitlines()[1:]
devices = [row.split()[0] for row in rows if len(row.split()) >= 2 and row.split()[1] == "device"]
if serial := os.environ.get('RG_ANDROID_SERIAL'):
    devices = [device for device in devices if device == serial]
if len(devices) != 1:
    raise SystemExit("Expected exactly one authorized Android phone.")
device = [adb, "-s", devices[0]]
with ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=root.parent / "site")) as server:
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        phone_port = subprocess.check_output(
            device + ["reverse", "--no-rebind", "tcp:0", f"tcp:{server.server_port}"], text=True, timeout=10
        ).strip()
        if not re.fullmatch(r"[0-9]{1,5}", phone_port) or not 0 < int(phone_port) < 65536:
            raise RuntimeError("ADB did not return a valid disposable loopback port.")
        try:
            subprocess.run(
                [sys.executable, str(root / "probe.py"), f"http://127.0.0.1:{phone_port}/"],
                stdin=subprocess.DEVNULL, check=True, timeout=100
            )
        finally:
            subprocess.run(device + ["reverse", "--remove", f"tcp:{phone_port}"], check=True, timeout=10)
    finally:
        server.shutdown()
        worker.join()
