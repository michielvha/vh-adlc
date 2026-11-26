import argparse
from contextlib import ExitStack
import ctypes
from ctypes import byref, c_int, c_uint, c_ulong, c_void_p
import os
from pathlib import Path
import secrets
import shlex
import socket
import struct
import subprocess
import time

from cryptography.hazmat.decrepit.ciphers.algorithms import TripleDES
from cryptography.hazmat.primitives.ciphers import Cipher, modes

parser = argparse.ArgumentParser(description="Probe input handoff on a disposable Xvfb display.")
parser.add_argument("work", type=Path, help="new private directory for the probe's artifacts")
parser.add_argument("mode", choices=("disable", "disconnect", "release"))
args = parser.parse_args()
work = args.work.resolve()
work.mkdir(mode=0o700)
after_accept = shlex.quote(str(Path(__file__).with_name("vnc-after-accept.sh").resolve()))
tool = os.environ["REMOTE_GUI_X11VNC"]
os.environ["RG_PROBE_CLIENTS"] = str(work / "clients")
display = os.environ["DISPLAY"]
button_and_shift_mask = 256 | 1  # X11 Button1Mask and ShiftMask
shift_keysym = 0xFFE1
password = secrets.token_hex(4)
passwd = work / "rfbauth"
subprocess.run([tool, "-storepasswd", password, str(passwd)], check=True, capture_output=True)
with socket.socket() as reserve:
    reserve.bind(("127.0.0.1", 0))
    port = reserve.getsockname()[1]

def read(sock, size):
    value = bytearray()
    while len(value) < size:
        data = sock.recv(size - len(value))
        if not data:
            raise RuntimeError("owned VNC disconnected")
        value.extend(data)
    return bytes(value)

def connect(stack, server):
    deadline = time.monotonic() + 5
    while True:
        if server.poll() is not None:
            raise RuntimeError("owned x11vnc exited")
        try:
            client = stack.enter_context(socket.create_connection(("127.0.0.1", port), timeout=2))
            break
        except ConnectionRefusedError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(.05)
    version = read(client, 12)
    if version != b"RFB 003.008\n":
        raise RuntimeError(f"expected RFB 3.8, received {version!r}")
    client.sendall(version)
    if 2 not in read(client, read(client, 1)[0]):
        raise RuntimeError("owned x11vnc did not offer VNC authentication")
    client.sendall(b"\x02")
    reverse = bytes(int(f"{byte:08b}"[::-1], 2) for byte in password.encode())
    encrypt = Cipher(TripleDES(reverse), modes.ECB()).encryptor()
    client.sendall(encrypt.update(read(client, 16)) + encrypt.finalize())
    if read(client, 4) != b"\0" * 4:
        raise RuntimeError("VNC authentication failed")
    client.sendall(b"\x01")
    header = read(client, 24)
    read(client, struct.unpack(">I", header[20:24])[0])
    return client

def control(*args):
    return subprocess.run([tool, "-display", display, *args], check=True,
                          timeout=5, capture_output=True, text=True).stdout.strip()

def key(client, keysym, pressed):
    client.sendall(struct.pack(">BBHI", 4, int(pressed), 0, keysym))

def pointer(client, x, y, buttons=0):
    client.sendall(struct.pack(">BBHH", 5, buttons, x, y))

xlib = ctypes.CDLL("libX11.so.6")
xlib.XOpenDisplay.argtypes = [ctypes.c_char_p]
xlib.XOpenDisplay.restype = c_void_p
xlib.XDefaultRootWindow.argtypes = [c_void_p]
xlib.XDefaultRootWindow.restype = c_ulong
xlib.XQueryPointer.argtypes = [c_void_p, c_ulong, ctypes.POINTER(c_ulong), ctypes.POINTER(c_ulong),
                              *[ctypes.POINTER(c_int)] * 4, ctypes.POINTER(c_uint)]
xlib.XCloseDisplay.argtypes = [c_void_p]
connection = xlib.XOpenDisplay(None)
if not connection:
    raise RuntimeError("cannot open the disposable X display")

def pointer_state():
    root, child = c_ulong(), c_ulong()
    rx, ry, wx, wy = c_int(), c_int(), c_int(), c_int()
    mask = c_uint()
    if not xlib.XQueryPointer(connection, xlib.XDefaultRootWindow(connection),
                              byref(root), byref(child), byref(rx), byref(ry),
                              byref(wx), byref(wy), byref(mask)):
        raise RuntimeError("cannot read owned X pointer")
    return (rx.value, ry.value), mask.value & button_and_shift_mask

def release_observed_mouse_and_shift():
    xtest = ctypes.CDLL("libXtst.so.6")
    xtest.XTestFakeButtonEvent.argtypes = [c_void_p, c_uint, c_int, c_ulong]
    xtest.XTestFakeKeyEvent.argtypes = [c_void_p, c_uint, c_int, c_ulong]
    xlib.XKeysymToKeycode.argtypes = [c_void_p, c_ulong]
    xlib.XKeysymToKeycode.restype = ctypes.c_ubyte
    xlib.XSync.argtypes = [c_void_p, c_int]
    if not xtest.XTestFakeButtonEvent(connection, 1, False, 0):
        raise RuntimeError("could not release the test button")
    if not xtest.XTestFakeKeyEvent(connection, xlib.XKeysymToKeycode(connection, shift_keysym), False, 0):
        raise RuntimeError("could not release the test modifier")
    xlib.XSync(connection, False)

def position():
    return pointer_state()[0]

def held():
    return pointer_state()[1]

def wait_for(observe, expected):
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        if observe() == expected:
            return
        time.sleep(.02)
    raise RuntimeError(f"expected {expected}, observed {observe()}")

def require_unchanged(expected):
    stop = time.monotonic() + .5
    while time.monotonic() < stop:
        if position() != expected:
            raise RuntimeError(f"disabled viewer mutated the pointer: {position()}")
        time.sleep(.01)

server = None
try:
    with (work / "vnc.log").open("w") as log, ExitStack() as resources:
        server = subprocess.Popen(
            [tool, "-display", display, "-localhost", "-rfbport", str(port),
             "-rfbauth", str(passwd), "-shared", "-forever", "-noxdamage", "-nosel",
             "-afteraccept", after_accept],
            stdin=subprocess.DEVNULL, stdout=log, stderr=log,
        )
        a = connect(resources, server)
        b = connect(resources, server)
        print("viewer source ports", a.getsockname()[1], b.getsockname()[1], flush=True)
        pointer(a, 110, 120)
        wait_for(position, (110, 120))
        pointer(b, 210, 220)
        wait_for(position, (210, 220))
        print("baseline: both real RFB clients mutated the owned pointer", flush=True)
        ids = {}
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            log_path = work / "clients"
            if log_path.exists():
                ids = {
                    int(source_port): ident
                    for ident, source_port in (line.split() for line in log_path.read_text().splitlines())
                }
            if a.getsockname()[1] in ids and b.getsockname()[1] in ids:
                break
            time.sleep(.05)
        else:
            raise RuntimeError("x11vnc did not attribute both loopback connections")
        first, second = [ids[c.getsockname()[1]] for c in (a, b)]
        if first == second:
            raise RuntimeError("both transport connections mapped to the same client")
        print("mapped native IDs", first, second, flush=True)
        print("disable acknowledgement", control("-sync", "-R", f"client_input:{first}:-"), flush=True)
        pointer(a, 310, 320)
        require_unchanged((210, 220))
        pointer(b, 410, 420)
        wait_for(position, (410, 420))
        print("observed A input blocked, B input applied", flush=True)
        control("-sync", "-R", f"client_input:{second}:-")
        control("-sync", "-R", f"client_input:{first}:KMB")
        pointer(a, 510, 520)
        wait_for(position, (510, 520))
        pointer(b, 610, 620)
        require_unchanged((510, 520))
        print("observed native pointer permission transfer", flush=True)
        pointer(a, 510, 520, buttons=1)
        key(a, shift_keysym, True)
        wait_for(held, button_and_shift_mask)
        control("-sync", "-R", f"client_input:{first}:-")
        print("held input mask after disable acknowledgement:", held(), flush=True)
        pointer(a, 650, 660)
        key(a, shift_keysym, False)
        if args.mode in ("disconnect", "release"):
            print("disconnect acknowledgement", control("-sync", "-R", f"disconnect:{first}"), flush=True)
            try:
                if a.recv(1):
                    raise RuntimeError("previous viewer still sends server data after disconnect")
            except ConnectionResetError:
                pass
            print("held mask after old viewer closes:", held(), flush=True)
            if pointer_state() != ((510, 520), button_and_shift_mask):
                raise RuntimeError("the fenced connection changed the pointer or released held input")
        if args.mode == "release":
            release_observed_mouse_and_shift()
            if held():
                raise RuntimeError("XTest release did not complete before regrant")
        control("-sync", "-R", f"client_input:{second}:KMB")
        pointer(b, 710, 720)
        wait_for(position, (710, 720))
        if held():
            raise RuntimeError("held input survived controller transfer")
        print("new viewer moved with no old held input", flush=True)
        pointer(b, 710, 720, buttons=1)
        key(b, shift_keysym, True)
        wait_for(held, button_and_shift_mask)
        pointer(b, 720, 730)
        key(b, shift_keysym, False)
        wait_for(position, (720, 730))
        wait_for(held, 0)
        print("successor button and modifier events still work", flush=True)
finally:
    xlib.XCloseDisplay(connection)
    if server is not None and server.poll() is None:
        server.terminate()
        try:
            server.wait(5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
    passwd.unlink(missing_ok=True)
