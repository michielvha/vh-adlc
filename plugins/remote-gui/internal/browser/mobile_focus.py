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


def focused(address, pid, x, y):
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
    pending = [(owner, ROOT)]
    seen = set()
    found = None
    while pending:
        if len(seen) >= 256 or time.monotonic() >= deadline:
            return None
        name, path = map(str, pending.pop())
        if name != owner or not path.startswith(PREFIX) or path in seen:
            continue
        seen.add(path)
        node = interface(bus, owner, path, ACCESSIBLE)
        states = node.GetState(timeout=.08)
        eligible = all(has(states, flag) for flag in ("EDITABLE", "FOCUSED", "VISIBLE", "SHOWING", "ENABLED"))
        if eligible and not has(states, "READ_ONLY"):
            component = interface(bus, owner, path, "org.a11y.atspi.Component")
            left, top, width, height = map(int, component.GetExtents(dbus.UInt32(0), timeout=.08))
            if left <= x < left + width and top <= y < top + height:
                if found is not None:
                    return None
                mode = keyboard_mode(bus, owner, path, node, states)
                if not mode:
                    return None
                token = hashlib.sha256(f"{pid}:{owner}:{path}".encode()).hexdigest()[:24]
                found = {"token":token, "mode":mode, "x":left, "y":top, "width":width, "height":height}
        children = node.GetChildren(timeout=.08)
        if len(pending) + len(children) > 256:
            return None
        pending.extend(children)
    return found


try:
    result = focused(sys.argv[1], *map(int, sys.argv[2:]))
except (dbus.DBusException, IndexError, TypeError, ValueError):
    result = None
print(json.dumps(result))
