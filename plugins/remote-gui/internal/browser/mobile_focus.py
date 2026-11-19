"""Read the owned Chromium's reported focus over the private accessibility bus."""

import hashlib
import json
import sys
import time

import dbus
import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

ACCESSIBLE = "org.a11y.atspi.Accessible"
ROOT = "/org/a11y/atspi/accessible/root"
PREFIX = "/org/a11y/atspi/accessible/"
MODES = {"text", "password", "email", "url", "tel", "search", "number"}


def interface(bus, destination, path, name):
    return dbus.Interface(bus.get_object(destination, path, introspect=False), name)


def has(states, name):
    bit = int(getattr(Atspi.StateType, name))
    return bool(int(states[bit // 32]) & (1 << (bit % 32)))


def contains_point(bounds, x, y):
    left, top, width, height = bounds
    return left <= x < left + width and top <= y < top + height


def keyboard_mode(bus, owner, path, node, states):
    role = str(node.GetRoleName(timeout=.08))
    if role == "password text":
        return "password"
    if role == "spin button":
        return "number"
    if has(states, "MULTI_LINE"):
        return "text"
    # The generic role of the browser's single-line entry is shared
    # with web inputs. A native toolbar ancestor identifies browser chrome.
    if role == "entry":
        current = path
        for _ in range(8):
            properties = interface(bus, owner, current, "org.freedesktop.DBus.Properties")
            name, current = map(str, properties.Get(ACCESSIBLE, "Parent", timeout=.08))
            if name != owner or not current.startswith(PREFIX):
                break
            parent = str(interface(bus, owner, current, ACCESSIBLE).GetRoleName(timeout=.08))
            if parent == "document web":
                break
            if parent == "tool bar":
                return "url"
    # Only an eligible ambiguous field reaches this call. Discard the map
    # immediately after selecting its allowlisted input type.
    mode = str(node.GetAttributes(timeout=.08).get("text-input-type", ""))
    return mode if mode in MODES else None


def read_field(bus, owner, path, states, x, y):
    if not all(has(states, flag) for flag in ("EDITABLE", "FOCUSED", "VISIBLE", "SHOWING", "ENABLED")):
        return None
    if has(states, "READ_ONLY"):
        return None
    component = interface(bus, owner, path, "org.a11y.atspi.Component")
    left, top, width, height = map(int, component.GetExtents(dbus.UInt32(0), timeout=.08))
    if not contains_point((left, top, width, height), x, y):
        return None
    node = interface(bus, owner, path, ACCESSIBLE)
    mode = keyboard_mode(bus, owner, path, node, states)
    if not mode:
        return None
    token = hashlib.sha256(f"{owner}:{path}".encode()).hexdigest()[:24]
    return {
        "field": {"token":token, "mode":mode, "x":left, "y":top, "width":width, "height":height},
        "path": path,
    }


def focused(address, pid, x, y, hint):
    deadline = time.monotonic() + .24
    bus = dbus.bus.BusConnection(address)
    registry = interface(bus, "org.a11y.atspi.Registry", ROOT, ACCESSIBLE)
    daemon = interface(bus, "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus")
    applications = registry.GetChildren(timeout=.08)
    if len(applications) > 12:
        return None
    candidates = [
        str(name) for name, _ in applications
        if int(daemon.GetConnectionUnixProcessID(str(name), timeout=.08)) == pid
    ]
    if len(candidates) != 1:
        return None
    owner = candidates[0]
    if hint.startswith(PREFIX):
        # A previously verified object reference is only a search hint. Its
        # current state, bounds and mode still need to match the current tap.
        try:
            node = interface(bus, owner, hint, ACCESSIBLE)
            match = read_field(bus, owner, hint, node.GetState(timeout=.08), x, y)
            if match is not None:
                return match
        except dbus.DBusException:
            pass
    pending = [(owner, ROOT)]
    documents = []
    searching_web = False
    seen = set()
    found = None
    while pending or documents:
        if len(seen) >= 256 or time.monotonic() >= deadline:
            return None
        if not pending:
            # Finish the browser chrome first. A large New Tab Page must not
            # consume the address bar's search budget. If a document reports
            # that it covers the tap, still check it for ambiguous focus.
            pending = documents
            documents = []
            searching_web = True
            if not pending:
                break
        name, path = map(str, pending.pop())
        if name != owner or not path.startswith(PREFIX) or path in seen:
            continue
        node = interface(bus, owner, path, ACCESSIBLE)
        if not searching_web and str(node.GetRoleName(timeout=.08)) == "document web":
            component = interface(bus, owner, path, "org.a11y.atspi.Component")
            bounds = map(int, component.GetExtents(dbus.UInt32(0), timeout=.08))
            if contains_point(bounds, x, y):
                documents.append((name, path))
            continue
        seen.add(path)
        states = node.GetState(timeout=.08)
        match = read_field(bus, owner, path, states, x, y)
        if match is not None:
            if found is not None:
                return None
            found = match
        children = node.GetChildren(timeout=.08)
        if len(pending) + len(children) > 256:
            return None
        pending.extend(children)
    return found


try:
    result = focused(sys.argv[1], *map(int, sys.argv[2:5]), sys.argv[5])
except (dbus.DBusException, IndexError, TypeError, ValueError):
    result = None
print(json.dumps(result))
