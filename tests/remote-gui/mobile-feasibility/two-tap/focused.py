# Disposable tap-to-type probe. Accept only the owned Chromium publisher.
import json
import os
import re
import sys
import time
import dbus
import gi

gi.require_version('Atspi', '2.0')
from gi.repository import Atspi

publisher_pid, x, y = map(int, sys.argv[1:])
deadline = time.monotonic() + .65
bus = dbus.bus.BusConnection(os.environ['AT_SPI_BUS_ADDRESS'])
api = 'org.a11y.atspi.'
root = '/org/a11y/atspi/accessible/root'
registry = dbus.Interface(bus.get_object(api+'Registry', root, introspect=False), api+'Accessible')
daemon = dbus.Interface(bus.get_object('org.freedesktop.DBus','/org/freedesktop/DBus',introspect=False),'org.freedesktop.DBus')

def has(state, name):
    index = int(getattr(Atspi.StateType, name))
    return int(state[index // 32]) & (1 << (index % 32))

def find():
    peers = registry.GetChildren(timeout=.2)
    if len(peers) != 1:
        return None
    owner, _ = map(str, peers[0])
    if int(daemon.GetConnectionUnixProcessID(owner, timeout=.2)) != publisher_pid:
        return None
    to_visit = list(peers)
    seen = set()
    while to_visit and len(seen) < 160 and time.monotonic() < deadline:
        name, path = map(str, to_visit.pop())
        if name != owner or not re.fullmatch(r'/org/a11y/atspi/accessible/(?:root|[0-9]+)', path) or path in seen:
            continue
        seen.add(path)
        obj = bus.get_object(name,path,introspect=False)
        node = dbus.Interface(obj, api+'Accessible')
        if path!=root:
            state = node.GetState(timeout=.15)
            if all(has(state, flag) for flag in ('EDITABLE','SHOWING','VISIBLE','ENABLED','FOCUSED')):
                bounds = list(map(int, dbus.Interface(obj,api+'Component').GetExtents(dbus.UInt32(0),timeout=.15)))
                x0,y0,w,h = bounds
                if x0<=x<x0+w and y0<=y<y0+h:
                    if str(node.GetRoleName(timeout=.15)) == 'password text':
                        mode='password'
                    elif has(state,'MULTI_LINE'):
                        mode='text'
                    else:
                        mode=str(node.GetAttributes(timeout=.15).get('text-input-type',''))
                        if mode not in {'text','password','email','search','tel','url','number'}:
                            return None
                    return {'bounds':bounds,'mode':mode}
        to_visit.extend(node.GetChildren(timeout=.15))
    return None

try:
    print(json.dumps(find()))
except (dbus.DBusException, TypeError, ValueError, IndexError):
    print('null')
