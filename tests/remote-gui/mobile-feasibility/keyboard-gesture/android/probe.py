import os
import re
import subprocess
import sys
import time
import uuid
import xml.etree.ElementTree as ET

ADB = os.environ.get("ANDROID_ADB", "adb")
fixture = sys.argv[1]
if not re.fullmatch(r"(?:https://[A-Za-z0-9.-]+|http://127[.]0[.]0[.]1):[0-9]+/", fixture):
    raise SystemExit("Expected the private fixture URL or the test's own ADB loopback URL.")

rows = subprocess.check_output([ADB, "devices"], text=True).splitlines()[1:]
active = [row.split()[0] for row in rows if len(row.split()) >= 2 and row.split()[1] == "device"]
if serial := os.environ.get('RG_ANDROID_SERIAL'):
    active = [device for device in active if device == serial]
if len(active) != 1:
    raise SystemExit("Expected exactly one authorized Android phone.")
serial = active[0]
dump_path = f"/data/local/tmp/remote-gui-keyboard-{uuid.uuid4().hex}.xml"

def adb(*args, timeout=20):
    return subprocess.check_output(
        [ADB, "-s", serial, *args], stdin=subprocess.DEVNULL, text=True, timeout=timeout
    )

def shell(*args, timeout=20):
    return adb("shell", *args, timeout=timeout)

def nodes():
    try:
        shell("uiautomator", "dump", dump_path, timeout=12)
        xml = shell("cat", dump_path, timeout=5)
        return list(ET.fromstring(xml).iter("node"))
    finally:
        shell("rm", "-f", dump_path, timeout=5)

def find(elements, label):
    return next(
        (element for element in elements
         if element.get("package") == "com.android.chrome"
         and label in (element.get("text"), element.get("content-desc"))), None
    )

def wait_for(label, deadline_seconds=25):
    end = time.monotonic() + deadline_seconds
    last_error = None
    while time.monotonic() < end:
        try:
            elements = nodes()
            target = find(elements, label)
            if target is not None:
                return elements
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ET.ParseError) as error:
            last_error = type(error).__name__
        time.sleep(.25)
    raise RuntimeError(f"Chrome did not expose the fixture label {label!r}. Last reader error: {last_error or 'none'}.")

def ime_shown():
    result = shell("dumpsys input_method | awk 'match($0,/mInputShown=(true|false)/) && !found++ { print substr($0,RSTART,RLENGTH) }'", timeout=8).strip()
    if result not in ("mInputShown=true", "mInputShown=false"):
        raise RuntimeError("Android did not expose its native input-method visibility signal.")
    return result == "mInputShown=true"

def observe_closed(duration_seconds):
    end = time.monotonic() + duration_seconds
    while True:
        if ime_shown():
            raise RuntimeError("The Android input method was unexpectedly visible.")
        if time.monotonic() >= end:
            return
        time.sleep(.15)

def wait_for_keyboard(deadline_seconds):
    end = time.monotonic() + deadline_seconds
    while time.monotonic() < end:
        if ime_shown():
            return
        time.sleep(.15)
    raise RuntimeError("The native Android keyboard did not appear after the first editable tap.")

def tap(surface, relative_y):
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", surface.get("bounds", ""))
    if not match:
        raise RuntimeError("Chrome did not expose the fixture canvas bounds.")
    left, top, right, bottom = map(int, match.groups())
    if not (left < right and top < bottom):
        raise RuntimeError("The fixture canvas has no usable area.")
    shell("input", "tap", str((left + right) // 2), str(round(top + relative_y * (bottom - top))))

print("Android:", shell("getprop", "ro.build.version.release").strip(), flush=True)
print("Device model:", shell("getprop", "ro.product.model").strip(), flush=True)
chrome = shell("dumpsys package com.android.chrome | grep -m 1 versionName=", timeout=10).strip()
if not chrome:
    raise RuntimeError("Chrome is not installed on the selected Android phone.")
print("Chrome:", chrome.partition("=")[2], flush=True)

launch = shell("am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", fixture, "-p", "com.android.chrome")
if "Error:" in launch or "Status: ok" not in launch:
    raise RuntimeError("Android did not start Chrome with the synthetic fixture.")

elements = wait_for("Gesture probe ready")
surface = find(elements, "Synthetic gesture surface")
if surface is None:
    raise RuntimeError("Chrome did not expose the synthetic gesture surface.")
observe_closed(0)
print("Native input method initially closed.", flush=True)

tap(surface, .75)
elements = wait_for("Plain area tapped")
observe_closed(1)
print("Plain area: one tap, native input method stayed closed.", flush=True)

surface = find(elements, "Synthetic gesture surface")
if surface is None:
    raise RuntimeError("The synthetic gesture surface disappeared after the plain-area tap.")
tap(surface, .25)
wait_for_keyboard(5)
wait_for("Editable area tapped")
if not ime_shown():
    raise RuntimeError("The native Android input method did not stay visible.")
print("Editable area: first tap opened the native Android keyboard.", flush=True)
