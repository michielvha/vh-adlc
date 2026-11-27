"""Read the owned Chromium's reported focus over the private accessibility bus."""

import hashlib
import json
import socket
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
PACKET_SIZE = 512
ELIGIBLE = ("EDITABLE", "FOCUSED", "VISIBLE", "SHOWING", "ENABLED")
MATCH_ALL = int(Atspi.CollectionMatchType.ALL)
CANONICAL = int(Atspi.CollectionSortOrder.CANONICAL)
ELIGIBLE_BITS = sum(1 << int(getattr(Atspi.StateType, name)) for name in ELIGIBLE)
# This AT-SPI match rule filters only on states. Empty attribute, role and
# interface lists make them unconstrained.
FOCUSED_EDITABLE = ([ELIGIBLE_BITS, 0], MATCH_ALL, {}, MATCH_ALL, [0, 0, 0, 0], MATCH_ALL, [], MATCH_ALL, False)


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
    if not all(has(states, flag) for flag in ELIGIBLE):
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
    return {"token": token, "mode": mode, "x": left, "y": top, "width": width, "height": height}


def focused(bus, pid, x, y):
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
    collection = interface(bus, owner, ROOT, "org.a11y.atspi.Collection")
    # Two references suffice to detect ambiguity. GetMatches returns only
    # object references, even for a browser with a large accessibility tree.
    references = collection.GetMatches(FOCUSED_EDITABLE, CANONICAL, 2, True,
                                       signature="(aiia{ss}iaiiasib)uib", timeout=.08)
    if len(references) != 1:
        return None
    name, path = map(str, references[0])
    if name != owner or not path.startswith(PREFIX):
        return None
    node = interface(bus, owner, path, ACCESSIBLE)
    return read_field(bus, owner, path, node.GetState(timeout=.08), x, y)


def serve(channel, bus):
    # Chromium must find the registry when the owned browser starts.
    for _ in range(20):
        if bus.name_has_owner("org.a11y.atspi.Registry"):
            channel.sendall(b"\x01")
            break
        time.sleep(.02)
    else:
        return

    while packet := channel.recv(PACKET_SIZE + 1):
        if len(packet) > PACKET_SIZE:
            return
        sequence, pid, x, y = json.loads(packet)
        try:
            result = focused(bus, pid, x, y)
        except (dbus.DBusException, IndexError, TypeError, ValueError):
            result = None
        reply = json.dumps({"sequence": sequence, "field": result}).encode()
        if len(reply) > PACKET_SIZE:
            return
        channel.sendall(reply)


with socket.socket(fileno=3) as channel:
    serve(channel, dbus.bus.BusConnection(sys.argv[1]))
