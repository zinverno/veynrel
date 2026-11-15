"""Send a real EWMH resize request to one PID-verified disposable X11 window."""
import ctypes as c
import os
import subprocess
import sys

wid, pid, width, height = map(int, sys.argv[1:])
assert 300 <= width <= 1600 and 300 <= height <= 1200
owner = subprocess.check_output(['xprop', '-id', hex(wid), '_NET_WM_PID'], text=True)
assert int(owner.strip().split('=')[-1]) == pid, owner
x = c.CDLL('libX11.so.6')
x.XOpenDisplay.argtypes = [c.c_char_p]; x.XOpenDisplay.restype = c.c_void_p
x.XDefaultRootWindow.argtypes = [c.c_void_p]; x.XDefaultRootWindow.restype = c.c_ulong
x.XInternAtom.argtypes = [c.c_void_p, c.c_char_p, c.c_int]; x.XInternAtom.restype = c.c_ulong
x.XSendEvent.argtypes = [c.c_void_p, c.c_ulong, c.c_int, c.c_long, c.c_void_p]
x.XFlush.argtypes = [c.c_void_p]; x.XCloseDisplay.argtypes = [c.c_void_p]

class Data(c.Union):
    _fields_ = [('b', c.c_char * 20), ('s', c.c_short * 10), ('l', c.c_long * 5)]

class Client(c.Structure):
    _fields_ = [('type', c.c_int), ('serial', c.c_ulong), ('send_event', c.c_int),
                ('display', c.c_void_p), ('window', c.c_ulong), ('message_type', c.c_ulong),
                ('format', c.c_int), ('data', Data)]

class Event(c.Union):
    _fields_ = [('client', Client), ('pad', c.c_long * 24)]

display = x.XOpenDisplay(os.environ.get('DISPLAY', ':0').encode())
assert display
try:
    event = Event(); event.client.type = 33; event.client.display = display
    event.client.window = wid; event.client.format = 32
    event.client.message_type = x.XInternAtom(display, b'_NET_MOVERESIZE_WINDOW', False)
    event.client.data.l[:] = [(1 << 10) | (1 << 11) | (2 << 12), 0, 0, width, height]
    assert x.XSendEvent(display, x.XDefaultRootWindow(display), False, (1 << 20) | (1 << 19), c.byref(event))
    x.XFlush(display)
finally:
    x.XCloseDisplay(display)
