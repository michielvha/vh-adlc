from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time

import dbus
import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

work = Path(sys.argv[1])
main_bus = dbus.SessionBus()
status = main_bus.get_object("org.a11y.Bus", "/org/a11y/bus", introspect=False)
address = status.GetAddress(dbus_interface="org.a11y.Bus", timeout=3)
bus = dbus.bus.BusConnection(address)
a11y = "org.a11y.atspi."
root = "/org/a11y/atspi/accessible/root"
registry = dbus.Interface(
    bus.get_object(a11y + "Registry", root, introspect=False),
    a11y + "Accessible",
)
daemon = dbus.Interface(
    bus.get_object("org.freedesktop.DBus", "/org/freedesktop/DBus", introspect=False),
    "org.freedesktop.DBus",
)


def server(body):
    class Page(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path != "/":
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(body.encode())

        def log_message(self, *_):
            pass

    listener = ThreadingHTTPServer(("127.0.0.1", 0), Page)
    threading.Thread(target=listener.serve_forever, daemon=True).start()
    return listener

styles = """<style>body{margin:0}
input,textarea,[contenteditable],button,iframe{box-sizing:border-box;width:240px;height:26px}
.row{position:absolute;left:25px;height:33px}</style>"""
child = server(styles + '<html><input type="text"></html>')
def row(index, markup):
    return f'<div class="row" style="top:{8 + index * 36}px">{markup}</div>'

items = [
    '<input type="text">',
    '<input type="email" name="rg-synthetic-private-attribute" aria-description="rg-synthetic-private-attribute">',
    '<input type="url">',
    '<input type="search">',
    '<input type="tel">',
    '<input type="number">',
    '<input type="password">',
    '<textarea></textarea>',
    '<div contenteditable></div>',
    '<input readonly>',
    '<input disabled>',
    '<input hidden>',
    '<input><button style="position:absolute;inset:0">Overlay</button>',
    f'<iframe src="http://127.0.0.1:{child.server_port}/" style="height:58px"></iframe>',
]
page = server('<!doctype html><meta charset="utf-8">' + styles + ''.join((row(i, markup) for i, markup in enumerate(items))))
env = dict(os.environ, AT_SPI_BUS_ADDRESS=address, GTK_A11Y="1",
           ACCESSIBILITY_ENABLED="1", XCURSOR_SIZE="24")
# Use the same human launch protections as the package, without automation.
args = [
    os.environ["REMOTE_GUI_CHROMIUM"], "--user-data-dir=" + str(work / "profile"),
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--force-renderer-accessibility", "--disable-sync", "--disable-background-networking", "--disable-component-update",
    "--password-store=basic", "--use-mock-keychain", "--disable-gpu",
    "--ozone-platform=x11", "--window-position=0,0", "--window-size=960,720",
    f"http://127.0.0.1:{page.server_port}/",
]

def state_contains(words, flag):
    flag = int(flag)
    return bool(int(words[flag // 32]) & (1 << (flag % 32)))

def role_state_geometry(ref, owner, found, visited):
    name, path = map(str, ref)
    if path in visited or not path.startswith("/org/a11y/atspi/accessible/"):
        return
    if name != owner or len(visited) >= 500:
        raise RuntimeError("unexpected accessible reference")
    visited.add(path)
    obj = bus.get_object(name, path, introspect=False)
    node = dbus.Interface(obj, a11y + "Accessible")
    role = str(node.GetRoleName(timeout=2))
    if role in {"entry", "text", "spin button", "password text", "section", "panel", "paragraph", "button"}:
        words = node.GetState(timeout=2)
        keys = ("EDITABLE", "VISIBLE", "SHOWING", "ENABLED", "SENSITIVE", "FOCUSED", "SINGLE_LINE", "MULTI_LINE")
        flags = [key.lower() for key in keys if state_contains(words, getattr(Atspi.StateType, key))]
        methods = node.GetInterfaces(timeout=2)
        bounds = dbus.Interface(obj, a11y + "Component").GetExtents(dbus.UInt32(0), timeout=2) if a11y + "Component" in methods else []
        found.append({"role": role, "flags": flags, "bounds": list(map(int, bounds)), "node": node, "interfaces": list(map(str, methods))})
    # Traverse only structural metadata. Attribute reads happen later and
    # only for known eligible controls in the synthetic fixture.
    for descendant in node.GetChildren(timeout=2):
        role_state_geometry(descendant, owner, found, visited)

with (work / "chromium.stderr").open("w") as log:
    chrome = subprocess.Popen(args, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=log)
    try:
        deadline = time.monotonic() + 18
        while time.monotonic() < deadline:
            if chrome.poll() is not None:
                raise RuntimeError(f"owned Chromium exited: {chrome.returncode}")
            peers = registry.GetChildren(timeout=2)
            if len(peers) > 1:
                raise RuntimeError("unexpected application on private accessibility bus")
            if peers:
                name = str(peers[0][0])
                pid = int(daemon.GetConnectionUnixProcessID(name, timeout=2))
                if pid != chrome.pid:
                    raise RuntimeError("accessibility publisher is not the owned browser")
                chrome_args = (Path("/proc") / str(pid) / "cmdline").read_bytes().split(b"\0")
                banned = (b"--no-sandbox", b"--disable-setuid-sandbox", b"--remote-debugging-", b"--enable-automation")
                for flag in banned:
                    if any(arg.startswith(flag) for arg in chrome_args):
                        raise RuntimeError(f"Chromium used a disallowed launch flag: {flag.decode()}")
                found = []
                try:
                    role_state_geometry(peers[0], name, found, set())
                except dbus.DBusException as err:
                    if err.get_dbus_name() not in {"org.freedesktop.DBus.Error.UnknownObject", "org.freedesktop.DBus.Error.Failed"}:
                        raise
                    time.sleep(.2)
                    continue
                fields = sorted(
                    (node for node in found
                     if node["bounds"] and node["bounds"][0] == 25
                     and node["bounds"][2:] == [240, 26]
                     and {"editable", "showing", "enabled"} <= set(node["flags"])),
                    key=lambda node: node["bounds"][1],
                )
                if len(fields) >= 8:
                    break
            time.sleep(.2)
        else:
            raise RuntimeError("synthetic editable fields were not ready")

        types = ("text", "email", "url", "search", "tel", "number", "password", "textarea")
        first_y = fields[0]["bounds"][1]
        by_y = {field["bounds"][1]: field for field in fields}
        try:
            signatures = {
                kind: [field["role"], field["flags"]]
                for index, kind in enumerate(types)
                for field in (by_y[first_y + index * 36],)
            }
        except KeyError as err:
            raise RuntimeError("fixture field geometry did not match the known row positions") from err
        if os.environ.get("REMOTE_GUI_PROBE_EDIT_INTERFACE") == "1":
            editable_interface = a11y + "EditableText"
            interface_support = {
                kind: editable_interface in by_y[first_y + index * 36]["interfaces"]
                for index, kind in enumerate(types)
            }
            print(json.dumps(interface_support, sort_keys=True))
            if any(interface_support.values()):
                raise RuntimeError("An editable control advertises EditableText. Recheck direct editing.")
            field = by_y[first_y]["node"]
            try:
                field.InsertText(dbus.Int32(0), "k", dbus.Int32(1),
                                 dbus_interface=editable_interface, timeout=2)
            except dbus.DBusException as error:
                if error.get_dbus_name() not in {"org.freedesktop.DBus.Error.UnknownMethod",
                                                   "org.freedesktop.DBus.Error.UnknownInterface"}:
                    raise
                print(f"Target-scoped InsertText refused: {error.get_dbus_name()}")
            else:
                raise RuntimeError("The unadvertised edit method returned. Recheck direct editing.")
        elif os.environ.get("REMOTE_GUI_PROBE_GEOMETRY_ONLY") == "1":
            print(json.dumps(signatures, indent=2))
            candidate_types = ("text", "email", "url", "search", "tel")
            if len({json.dumps(signatures[kind]) for kind in candidate_types}) != len(candidate_types):
                raise SystemExit("F1: safe role and state do not distinguish the required text keyboard modes")
        else:
            supported_modes = {"text", "email", "url", "search", "tel", "number", "password"}
            modes = {}
            for index, kind in enumerate(types[:-1]):
                node = by_y[first_y + index * 36]["node"]
                # Keep only the bounded enum. The one synthetic case also
                # confirms that filtering genuinely has a sentinel to discard.
                attributes = node.GetAttributes(timeout=2)
                if kind == "email":
                    if not any(attributes.get(key) == "rg-synthetic-private-attribute"
                               for key in ("html-input-name", "description")):
                        raise RuntimeError("the synthetic attribute sentinel was not in the reply")
                input_type = attributes.get("text-input-type")
                modes[kind] = str(input_type) if input_type in supported_modes else "unknown"
                del input_type, attributes
            modes["textarea"] = "text" if "multi_line" in signatures["textarea"][1] else "unknown"
            print(json.dumps(modes, indent=2))
            expected = {kind: kind for kind in types[:-1]} | {"textarea": "text"}
            if modes != expected:
                raise SystemExit("F1: the filtered metadata does not identify every expected keyboard mode")
    finally:
        if chrome.poll() is None:
            chrome.terminate()
            try:
                chrome.wait(8)
            except subprocess.TimeoutExpired:
                chrome.kill()
                chrome.wait()
        page.shutdown()
        child.shutdown()
