import os
import json
from urllib.request import Request, urlopen
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

def tap(surface, relative_y, relative_x=.5):
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", surface.get("bounds", ""))
    if not match:
        raise RuntimeError("Chrome did not expose the fixture canvas bounds.")
    left, top, right, bottom = map(int, match.groups())
    if not (left < right and top < bottom):
        raise RuntimeError("The fixture canvas has no usable area.")
    shell("input", "tap", str(round(left + relative_x * (right-left))), str(round(top + relative_y * (bottom - top))))

def state():
    with urlopen(sys.argv[2]+"state",timeout=5) as response:
        return json.load(response)

print("Android", shell("getprop", "ro.build.version.release").strip(), flush=True)
launch = shell("am","start","-W","-a","android.intent.action.VIEW","-d",fixture,"-p","com.android.chrome")
if "Error:" in launch or "Status: ok" not in launch:
    raise RuntimeError("Chrome did not start with the synthetic page")
elements=wait_for("Live viewer ready")
surface=find(elements,"Synthetic live remote canvas")
if surface is None:
    raise RuntimeError("missing live canvas bounds")
observe_closed(0)
tap(surface,.88)
elements=wait_for("Plain area tapped")
observe_closed(1)
print("Plain tap kept Android keyboard closed.",flush=True)
surface=find(elements,"Synthetic live remote canvas")
geometry=state()["geometry"]
a=geometry["fields"]["a"]
tap(surface,(a["y"]+a["height"]/2)/geometry["height"],(a["x"]+a["width"]/2)/geometry["width"])
wait_for_keyboard(5)
wait_for("Remote field A focused")
print("One editable tap opened the Android keyboard and focused real remote A.",flush=True)
shell("input","text","z")
wait_for("Remote edit applied")
expected={"status":"applied","exactA":True,"emptyB":True,"deliveredA":1,"deliveredB":0}
result=state()["editResult"]
if result!=expected:
    raise RuntimeError(f"wrong positive edit result: {result}")
print("The edit reached only the bound remote field and fired input once.",flush=True)
with urlopen(Request(sys.argv[2]+"arm",method="POST",data=b"{}"),timeout=5) as response:
    response.read()
shell("input","text","z")
wait_for("Remote edit cancelled")
expected["status"]="cancelled"
result=state()["editResult"]
if result!=expected:
    raise RuntimeError(f"wrong stale edit result: {result}")
print("When the page moved focus to B, the stale edit was cancelled with no mutation.",flush=True)
