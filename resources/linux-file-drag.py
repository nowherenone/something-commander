#!/usr/bin/env python3
"""Drag local files out of Something Commander on Linux.

Electron's startDrag only offers a text/uri-list with no CRLF terminator and
no file bytes. Targets that follow the file handle (XdndDirectSave0 or
application/octet-stream) then write a 0-byte file and report that the file
is empty. This source offers the same set Nemo does, plus the bytes.
"""
import ctypes
import ctypes.util
import json
import os
import shutil
import sys
import time
import urllib.parse

# Inline file bytes above this size make the drag selection huge. Those files
# travel by URI and, for a single file, by XdndDirectSave0.
OCTET_LIMIT = 8 * 1024 * 1024


def existing(paths):
    out = []
    for raw in paths:
        path = os.path.abspath(raw)
        if os.path.exists(path):
            out.append(path)
    return out


def payloads(paths):
    uris = ['file://' + urllib.parse.quote(p) for p in paths]
    uri_list = ''.join(u + '\r\n' for u in uris)
    plain = '\n'.join(paths)
    gnome = 'copy\n' + '\n'.join(uris) + '\n'
    octet = None
    if len(paths) == 1 and os.path.isfile(paths[0]):
        size = os.path.getsize(paths[0])
        if size <= OCTET_LIMIT:
            with open(paths[0], 'rb') as handle:
                octet = handle.read()
    return {
        'uris': uris,
        'uri_list': uri_list,
        'plain': plain,
        'gnome': gnome,
        'octet': octet,
        'direct_save': len(paths) == 1 and os.path.isfile(paths[0]),
    }


def xlib():
    lib = ctypes.CDLL(ctypes.util.find_library('X11'))
    lib.XOpenDisplay.restype = ctypes.c_void_p
    lib.XInternAtom.restype = ctypes.c_ulong
    lib.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
    lib.XChangeProperty.argtypes = [
        ctypes.c_void_p,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_int,
    ]
    lib.XGetWindowProperty.argtypes = [
        ctypes.c_void_p,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_long,
        ctypes.c_long,
        ctypes.c_int,
        ctypes.c_ulong,
        ctypes.POINTER(ctypes.c_ulong),
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_ulong),
        ctypes.POINTER(ctypes.c_ulong),
        ctypes.POINTER(ctypes.c_void_p),
    ]
    lib.XFree.argtypes = [ctypes.c_void_p]
    lib.XFlush.argtypes = [ctypes.c_void_p]
    display = lib.XOpenDisplay(None)
    return lib, display


def intern(lib, display, name):
    return lib.XInternAtom(display, name.encode(), 0)


def set_prop(lib, display, xid, value):
    atom = intern(lib, display, 'XdndDirectSave0')
    string = intern(lib, display, 'STRING')
    buf = ctypes.create_string_buffer(value)
    lib.XChangeProperty(display, ctypes.c_ulong(xid), atom, string, 8, 0, buf, len(value))
    lib.XFlush(display)


def get_prop(lib, display, xid):
    atom = intern(lib, display, 'XdndDirectSave0')
    actual_type = ctypes.c_ulong()
    actual_fmt = ctypes.c_int()
    nitems = ctypes.c_ulong()
    leftover = ctypes.c_ulong()
    prop = ctypes.c_void_p()
    lib.XGetWindowProperty(
        display,
        ctypes.c_ulong(xid),
        atom,
        0,
        4096,
        0,
        0,
        ctypes.byref(actual_type),
        ctypes.byref(actual_fmt),
        ctypes.byref(nitems),
        ctypes.byref(leftover),
        ctypes.byref(prop),
    )
    if not prop.value or nitems.value == 0:
        return b''
    data = ctypes.string_at(prop.value, nitems.value)
    lib.XFree(prop)
    return data


def pulse_button(release):
    libx, display = xlib()
    libxt = ctypes.CDLL(ctypes.util.find_library('Xtst'))
    libxt.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
    libxt.XTestFakeButtonEvent(display, 1, 0 if release else 1, 0)
    libx.XFlush(display)


def run_drag(paths):
    import gi

    gi.require_version('Gdk', '3.0')
    gi.require_version('Gtk', '3.0')
    from gi.repository import Gdk, Gtk

    data = payloads(paths)
    win = Gtk.Window(type=Gtk.WindowType.POPUP)
    win.set_default_size(1, 1)
    win.move(-200, -200)
    win.add(Gtk.Label(label='drag'))
    win.show_all()
    xid = win.get_window().get_xid()
    lib, display = xlib()
    if data['direct_save']:
        set_prop(lib, display, xid, os.path.basename(paths[0]).encode() + b'\x00')

    entries = [
        Gtk.TargetEntry.new('text/uri-list', 0, 1),
        Gtk.TargetEntry.new('text/plain', 0, 2),
        Gtk.TargetEntry.new('text/plain;charset=utf-8', 0, 2),
        Gtk.TargetEntry.new('UTF8_STRING', 0, 2),
        Gtk.TargetEntry.new('x-special/gnome-copied-files', 0, 3),
    ]
    if data['octet'] is not None:
        entries.append(Gtk.TargetEntry.new('application/octet-stream', 0, 4))
    if data['direct_save']:
        entries.append(Gtk.TargetEntry.new('XdndDirectSave0', 0, 5))

    def on_data_get(_widget, _context, selection, info, _time):
        if info == 1:
            selection.set_uris(data['uris'])
        elif info == 2:
            selection.set_text(data['plain'], -1)
        elif info == 3:
            selection.set(selection.get_target(), 8, data['gnome'].encode())
        elif info == 4 and data['octet'] is not None:
            selection.set(selection.get_target(), 8, data['octet'])
        elif info == 5:
            raw = get_prop(lib, display, xid)
            dest = raw.split(b'\x00', 1)[0].decode('utf-8', 'replace').strip()
            ok = False
            # Basename means the target has not chosen a destination yet.
            if dest.startswith(os.sep) and os.path.abspath(dest) != paths[0]:
                try:
                    os.makedirs(os.path.dirname(dest) or os.sep, exist_ok=True)
                    shutil.copy2(paths[0], dest)
                    ok = True
                except OSError:
                    ok = False
            selection.set(selection.get_target(), 8, b'S' if ok else b'F')

    def on_end(*_args):
        Gtk.main_quit()

    win.connect('drag-data-get', on_data_get)
    win.connect('drag-end', on_end)

    actions = Gdk.DragAction.COPY | Gdk.DragAction.MOVE | Gdk.DragAction.LINK
    target_list = Gtk.TargetList.new(entries)

    def begin():
        seat = Gdk.Display.get_default().get_default_seat()
        _screen, x, y = seat.get_pointer().get_position()
        return win.drag_begin_with_coordinates(target_list, actions, 1, None, int(x), int(y))

    ctx = begin()
    if ctx is None:
        # The originating app still holds the button grab. Let it go, grab
        # from here, and press again so the gesture the user is already
        # holding continues.
        pulse_button(True)
        time.sleep(0.02)
        ctx = begin()
        pulse_button(False)
    if ctx is None:
        sys.exit(2)
    Gtk.main()


def main():
    args = sys.argv[1:]
    if args and args[0] == '--dump':
        built = payloads(existing(args[1:]))
        json.dump(
            {
                'uri_list': built['uri_list'],
                'plain': built['plain'],
                'gnome': built['gnome'],
                'octet_len': None if built['octet'] is None else len(built['octet']),
                'direct_save': built['direct_save'],
            },
            sys.stdout,
        )
        return
    paths = existing(args)
    if not paths:
        sys.exit(1)
    run_drag(paths)


if __name__ == '__main__':
    main()
