"""Send a browser zoom accelerator only to the fixture's private viewer display."""
import ctypes as c
import sys
import time

if len(sys.argv) != 2 or sys.argv[1] not in ("in", "reset"):
    raise SystemExit("expected in or reset")
x = c.CDLL("libX11.so.6")
xt = c.CDLL("libXtst.so.6")
x.XOpenDisplay.argtypes = [c.c_char_p]
x.XOpenDisplay.restype = c.c_void_p
x.XDefaultRootWindow.argtypes = [c.c_void_p]
x.XDefaultRootWindow.restype = c.c_ulong
x.XQueryTree.argtypes = [c.c_void_p, c.c_ulong, c.POINTER(c.c_ulong), c.POINTER(c.c_ulong), c.POINTER(c.POINTER(c.c_ulong)), c.POINTER(c.c_uint)]
x.XGetGeometry.argtypes = [c.c_void_p, c.c_ulong, c.POINTER(c.c_ulong), c.POINTER(c.c_int), c.POINTER(c.c_int), c.POINTER(c.c_uint), c.POINTER(c.c_uint), c.POINTER(c.c_uint), c.POINTER(c.c_uint)]
x.XSetInputFocus.argtypes = [c.c_void_p, c.c_ulong, c.c_int, c.c_ulong]
x.XKeysymToKeycode.argtypes = [c.c_void_p, c.c_ulong]
x.XKeysymToKeycode.restype = c.c_ubyte
x.XSync.argtypes = [c.c_void_p, c.c_int]
x.XFree.argtypes = [c.c_void_p]
x.XCloseDisplay.argtypes = [c.c_void_p]
xt.XTestFakeKeyEvent.argtypes = [c.c_void_p, c.c_uint, c.c_int, c.c_ulong]
d = x.XOpenDisplay(None)
if not d:
    raise SystemExit("fixture display unavailable")
try:
    root, parent, count = c.c_ulong(), c.c_ulong(), c.c_uint()
    children = c.POINTER(c.c_ulong)()
    x.XQueryTree(d, x.XDefaultRootWindow(d), c.byref(root), c.byref(parent), c.byref(children), c.byref(count))
    largest, area = 0, 0
    for i in range(count.value):
        r, a, b, w, h, border, depth = c.c_ulong(), c.c_int(), c.c_int(), c.c_uint(), c.c_uint(), c.c_uint(), c.c_uint()
        x.XGetGeometry(d, children[i], c.byref(r), c.byref(a), c.byref(b), c.byref(w), c.byref(h), c.byref(border), c.byref(depth))
        if w.value * h.value > area:
            largest, area = children[i], w.value * h.value
    x.XFree(children)
    if not largest:
        raise SystemExit("fixture browser window unavailable")
    x.XSetInputFocus(d, largest, 2, 0)
    control = x.XKeysymToKeycode(d, 0xFFE3)
    key = x.XKeysymToKeycode(d, 0x003D if sys.argv[1] == "in" else 0x0030)
    for code, pressed in [(control, 1), (key, 1), (key, 0), (control, 0)]:
        xt.XTestFakeKeyEvent(d, code, pressed, 0)
    x.XSync(d, 0)
    time.sleep(0.1)
finally:
    x.XCloseDisplay(d)
