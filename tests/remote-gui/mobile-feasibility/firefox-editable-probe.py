from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
import ctypes as C
import json
import os
import shutil
import subprocess
import sys
import threading
import time

import dbus
import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

work = Path(sys.argv[1])
a11y = "org.a11y.atspi."
root = "/org/a11y/atspi/accessible/root"
main_bus = dbus.SessionBus()
status = main_bus.get_object("org.a11y.Bus", "/org/a11y/bus", introspect=False)
address = status.GetAddress(dbus_interface="org.a11y.Bus", timeout=3)
bus = dbus.bus.BusConnection(address)
registry = dbus.Interface(bus.get_object(a11y+"Registry", root, introspect=False), a11y+"Accessible")
daemon = dbus.Interface(bus.get_object("org.freedesktop.DBus", "/org/freedesktop/DBus", introspect=False), "org.freedesktop.DBus")
events = []
command = "initial"

def serve(body):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/":
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                payload = body()
            elif self.path == "/command":
                self.send_response(200)
                payload = command
            else:
                self.send_error(404)
                return
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload.encode())

        def do_POST(self):
            url = urlsplit(self.path)
            if url.path != "/observed":
                self.send_error(404)
                return
            query = parse_qs(url.query)
            events.append(tuple(query.get(key, [""])[0] for key in ("event", "target", "matched")))
            self.send_response(204)
            self.end_headers()

        def log_message(self, *_):
            pass
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server

page_style = """<!doctype html><meta charset="utf-8"><title>Private edit fixture</title><style>
body{margin:0}.control{position:absolute;left:26px;box-sizing:border-box;width:250px;height:27px;border:1px solid black}
iframe{position:absolute;left:26px;width:340px;height:100px;border:0}</style>"""
observation_script = """<script>
function report(event,target,matched) {
    fetch('/observed?' + new URLSearchParams({event,target,matched}), {method:'POST'});
}
const fields = [...document.querySelectorAll('[data-target]')];
for (const field of fields) {
    const value = () => field.isContentEditable ? field.textContent : field.value;
    const matched = () => value() === field.dataset.expected;
    const changed = () => value() !== '';
    let previousValue = value();
    field.addEventListener('focus', () => report('focus',field.id,true));
    field.addEventListener('input', () => report('input',field.id,matched()));
    setInterval(() => {
        const current = value();
        if (current !== previousValue) {
            previousValue = current;
            report(changed() ? 'state' : 'cleared',field.id,matched());
        }
    },40);
}
const other = document.getElementById('alternate');
let previous = '';
setInterval(async () => {
    const next = await fetch('/command',{cache:'no-store'}).then(r => r.text());
    if (next === previous) return;
    previous = next;
    const [which, mode] = next.split(':');
    const selected = document.getElementById(which);
    if (mode === 'focus' && selected) {
        selected.focus();
        report('armed',next,document.hasFocus() && document.activeElement === selected);
    } else if (mode === 'switch') {
        if (selected) selected.focus();
        if (other) {
            other.focus();
            report('armed',next,document.hasFocus() && document.activeElement === other);
        }
    }
},60);
if (other) other.focus();
</script>"""
child = serve(lambda: page_style +
              '<input class="control" data-target data-expected="z" id="framefield" style="top:12px;width:220px">' +
              observation_script)
rows = [
    ("plain","input","type=text","z"), ("alternate","input","type=text",""),
    ("password","input","type=password","z"), ("area","textarea","","z"),
    ("editable","div","contenteditable","z"), ("email","input","type=email","z"),
    ("search","input","type=search","z"), ("url","input","type=url","z"),
    ("telephone","input","type=tel","z"), ("number","input","type=number","7"),
]
controls = "".join(
    f'<{tag} id="{name}" class="control" style="top:{14+index*43}px" data-target data-expected="{value}" {attrs}>'
    + (f'</{tag}>' if tag != "input" else "")
    for index,(name,tag,attrs,value) in enumerate(rows)
)
page = serve(lambda: page_style+controls+
             f'<iframe title="Fixture frame" style="top:452px" src="http://127.0.0.1:{child.server_port}/"></iframe>'
             +observation_script)

def has_state(words, flag):
    flag = int(flag)
    return bool(int(words[flag // 32]) & (1 << (flag % 32)))

def collect(ref, owner, entries, seen):
    name,path = map(str,ref)
    if path in seen:
        return
    if len(seen) >= 1000 or name != owner:
        raise RuntimeError("unexpected accessibility reference")
    seen.add(path)
    obj = bus.get_object(name,path,introspect=False)
    accessible = dbus.Interface(obj,a11y+"Accessible")
    states = accessible.GetState(timeout=2)
    if has_state(states,Atspi.StateType.EDITABLE) and has_state(states,Atspi.StateType.SHOWING):
        interfaces = accessible.GetInterfaces(timeout=2)
        if a11y+"Component" in interfaces:
            bounds = dbus.Interface(obj,a11y+"Component").GetExtents(dbus.UInt32(0),timeout=2)
            entries.append((tuple(map(int,bounds)),obj,a11y+"EditableText" in interfaces))
    for descendant in accessible.GetChildren(timeout=2):
        collect(descendant,owner,entries,seen)

def wait_for(predicate, seconds=3):
    deadline = time.monotonic()+seconds
    while time.monotonic() < deadline:
        result = predicate()
        if result:
            return result
        time.sleep(.05)
    return None

def scan(browser):
    peers = registry.GetChildren(timeout=2)
    if not peers:
        return []
    if len(peers)!=1:
        raise RuntimeError("unexpected application on private bus")
    owner = str(peers[0][0])
    if int(daemon.GetConnectionUnixProcessID(owner,timeout=2))!=browser.pid:
        raise RuntimeError("unexpected accessibility publisher")
    found=[]
    try:
        collect(peers[0],owner,found,set())
    except dbus.DBusException as error:
        if error.get_dbus_name() not in {"org.freedesktop.DBus.Error.UnknownObject","org.freedesktop.DBus.Error.Failed"}:
            raise
        return []
    return found

def focus_window(browser):
    x = C.CDLL("libX11.so.6")
    display_t, window_t = C.c_void_p, C.c_ulong
    x.XOpenDisplay.argtypes, x.XOpenDisplay.restype = [C.c_char_p], display_t
    x.XDefaultRootWindow.argtypes, x.XDefaultRootWindow.restype = [display_t], window_t
    x.XQueryTree.argtypes = [display_t,window_t,C.POINTER(window_t),C.POINTER(window_t),C.POINTER(C.POINTER(window_t)),C.POINTER(C.c_uint)]
    x.XGetGeometry.argtypes = [display_t,window_t,C.POINTER(window_t),C.POINTER(C.c_int),C.POINTER(C.c_int),*[C.POINTER(C.c_uint)]*4]
    x.XSetInputFocus.argtypes = [display_t,window_t,C.c_int,C.c_ulong]
    x.XGetInputFocus.argtypes = [display_t,C.POINTER(window_t),C.POINTER(C.c_int)]
    x.XSync.argtypes = [display_t,C.c_int]
    x.XFree.argtypes = [C.c_void_p]
    x.XCloseDisplay.argtypes = [display_t]
    display = x.XOpenDisplay(None)
    if not display:
        raise RuntimeError("private Xvfb display is missing")
    try:
        root, parent, count = window_t(), window_t(), C.c_uint()
        children = C.POINTER(window_t)()
        if not x.XQueryTree(display,x.XDefaultRootWindow(display),C.byref(root),C.byref(parent),C.byref(children),C.byref(count)):
            return False
        targets = []
        try:
            for idx in range(count.value):
                window = children[idx]
                window_root, x0, y0 = window_t(), C.c_int(), C.c_int()
                width, height, border, depth = C.c_uint(), C.c_uint(), C.c_uint(), C.c_uint()
                if not x.XGetGeometry(display,window,C.byref(window_root),C.byref(x0),C.byref(y0),
                                      C.byref(width),C.byref(height),C.byref(border),C.byref(depth)):
                    continue
                if width.value < 340 or height.value < 480:
                    continue
                props = subprocess.run(["xprop","-id",str(window),"_NET_WM_PID"],capture_output=True,text=True,timeout=2,check=False)
                if props.stdout.strip().endswith(" = " + str(browser.pid)):
                    targets.append(window)
        finally:
            x.XFree(children)
        if len(targets) != 1:
            return False
        window, revert = window_t(), C.c_int()
        x.XGetInputFocus(display,C.byref(window),C.byref(revert))
        print("Synthetic Firefox window had native focus before setup:", window.value == targets[0], flush=True)
        x.XSetInputFocus(display,targets[0],2,0)
        x.XSync(display,0)
        x.XGetInputFocus(display,C.byref(window),C.byref(revert))
        return window.value == targets[0]
    finally:
        x.XCloseDisplay(display)

def type_control():
    x = C.CDLL("libX11.so.6")
    xtest = C.CDLL("libXtst.so.6")
    x.XOpenDisplay.argtypes, x.XOpenDisplay.restype = [C.c_char_p], C.c_void_p
    x.XKeysymToKeycode.argtypes = [C.c_void_p, C.c_ulong]
    x.XKeysymToKeycode.restype = C.c_ubyte
    xtest.XTestFakeKeyEvent.argtypes = [C.c_void_p, C.c_uint, C.c_int, C.c_ulong]
    x.XSync.argtypes = [C.c_void_p, C.c_int]
    x.XCloseDisplay.argtypes = [C.c_void_p]
    display = x.XOpenDisplay(None)
    if not display:
        raise RuntimeError("private display not found")
    try:
        code = x.XKeysymToKeycode(display, ord("z"))
        if not code or not xtest.XTestFakeKeyEvent(display, code, 1, 0) or not xtest.XTestFakeKeyEvent(display, code, 0, 0):
            raise RuntimeError("could not send the positive-control key")
        x.XSync(display, 0)
    finally:
        x.XCloseDisplay(display)

profile = work/"profile"
profile.mkdir(mode=0o700)
(profile/"user.js").write_text(
    'user_pref("browser.shell.checkDefaultBrowser", false);\n'
    'user_pref("browser.startup.homepage_override.mstone", "ignore");\n'
    'user_pref("browser.aboutwelcome.enabled", false);\n'
    'user_pref("browser.startup.page", 0);\n'
    'user_pref("accessibility.force_disabled", 0);\n'
)
env = dict(os.environ,AT_SPI_BUS_ADDRESS=address,GTK_A11Y="1",ACCESSIBILITY_ENABLED="1",MOZ_ENABLE_WAYLAND="0")
args = [shutil.which("firefox"),"--no-remote","--profile",str(profile),"--new-window",
        f"http://127.0.0.1:{page.server_port}/"]
with (work/"firefox.stderr").open("w") as log:
    browser=subprocess.Popen(args,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=log)
    try:
        if not wait_for(lambda: ("focus","alternate","true") in events,20):
            raise RuntimeError("Firefox did not focus the synthetic fixture.")
        if not wait_for(lambda: focus_window(browser),8):
            raise RuntimeError("Could not confirm native focus of the private Firefox fixture window.")
        def gather():
            entries=scan(browser)
            targets=sorted((e for e in entries if e[0][2:]==(250,27)),key=lambda e:e[0][1])
            return (targets,entries) if len(targets)>=9 else None
        discovered=wait_for(gather,16)
        if not discovered:
            print("Safe visible geometry:",[(e[0],e[2]) for e in scan(browser)],flush=True)
            raise RuntimeError("The private bus did not expose the fixture field geometry.")
        targets,entries=discovered
        origin_y=targets[0][0][1]
        by_y={e[0][1]:e for e in targets}
        plan=[(kind,by_y.get(origin_y+index*43),value)
              for index,(kind,_,_,value) in enumerate(rows) if kind!="alternate"]
        nested=next((e for e in entries if e[0][2:]==(220,27)),None)
        plan.append(("framefield",nested,"z"))
        print("Address-like candidates above document:",[e[2] for e in entries if e[0][1]<origin_y],flush=True)
        method = os.environ.get("RG_FF_EDIT_METHOD","insert")
        if method == "native":
            plan = plan[:1]
        outcomes={}
        for kind,entry,value in plan:
            if not entry or not entry[2]:
                outcomes[kind]="field missing or no EditableText"
                continue
            mode=os.environ.get("RG_FF_EDIT_CASE","focus")
            command=kind+":"+mode
            if not wait_for(lambda: ("armed",command,"true") in events):
                outcomes[kind]="fixture did not acknowledge expected focus"
                continue
            before=len(events)
            try:
                editor=dbus.Interface(entry[1],a11y+"EditableText")
                if method == "native":
                    type_control()
                    accepted = True
                elif method == "set":
                    accepted = editor.SetTextContents(value,timeout=3)
                else:
                    accepted = editor.InsertText(dbus.Int32(0),value,dbus.Int32(len(value)),timeout=3)
            except dbus.DBusException as error:
                outcomes[kind]=error.get_dbus_name()
                continue
            wait_for(lambda: any(e[0]=="state" for e in events[before:]),1)
            time.sleep(.1)
            outcomes[kind]={"method_return":bool(accepted),
                            "observed":[e for e in events[before:] if e[0] in {"state","input","focus"}]}
        print(json.dumps(outcomes,indent=2),flush=True)
        if method == "native" and ["input", "plain", "true"] not in [list(e) for e in outcomes["plain"]["observed"]]:
            raise RuntimeError("The native positive control failed. Browser field results are inconclusive.")
    finally:
        browser.terminate()
        try:
            browser.wait(7)
        except subprocess.TimeoutExpired:
            browser.kill()
            browser.wait()
        page.shutdown()
        child.shutdown()
