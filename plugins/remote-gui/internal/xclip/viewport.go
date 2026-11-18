package xclip

import (
	"context"
	"errors"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/viewport"
)

// Window is native outer geometry on the session's private, unmanaged X display.
type Window struct {
	ID                  uint32
	X, Y, Width, Height int
	Normal              bool
}

// clientPID uses the server's X-Resource extension, not the client's asserted PID alone.
func clientPID(ctx context.Context, c *conn, id uint32) (int, error) {
	name := "X-Resource"
	req := make([]byte, 8+len(name)+pad4(len(name)))
	req[0] = 98
	le.PutUint16(req[4:], uint16(len(name)))
	copy(req[8:], name)
	reply, err := c.call(ctx, req)
	if err != nil {
		return 0, err
	}
	if len(reply) < 32 || reply[8] == 0 {
		return 0, ErrUnavailable
	}
	query := make([]byte, 16)
	query[0] = reply[9]
	query[1] = 4
	le.PutUint32(query[4:], 1)
	le.PutUint32(query[8:], id)
	le.PutUint32(query[12:], 2)
	value, err := c.call(ctx, query)
	if err != nil {
		return 0, err
	}
	if len(value) < 48 || le.Uint32(value[8:]) != 1 || le.Uint32(value[36:])&2 == 0 || le.Uint32(value[40:]) != 4 {
		return 0, ErrProtocol
	}
	return int(le.Uint32(value[44:])), nil
}
func (h *Helper) ownsWindow(ctx context.Context, c *conn, id uint32, pid int) (bool, error) {
	atom, err := h.intern(ctx, c, "_NET_WM_PID")
	if err != nil {
		return false, err
	}
	property, err := c.call(ctx, getProperty(id, atom, 1))
	if err != nil {
		return false, err
	}
	if len(property) >= 36 && property[1] == 32 && int(le.Uint32(property[32:])) != pid {
		return false, nil
	}
	actual, err := clientPID(ctx, c, id)
	return actual == pid, err
}
func geometry(ctx context.Context, c *conn, id uint32) (Window, error) {
	reply, err := c.call(ctx, windowRequest(14, id))
	if err != nil {
		return Window{}, err
	}
	if len(reply) < 32 {
		return Window{}, ErrProtocol
	}
	return Window{ID: id, X: int(int16(le.Uint16(reply[12:]))), Y: int(int16(le.Uint16(reply[14:]))), Width: int(le.Uint16(reply[16:])), Height: int(le.Uint16(reply[18:]))}, nil
}

// Windows snapshots only viewable top-level windows owned by this browser process.
func (h *Helper) Windows(ctx context.Context, pid int) ([]Window, error) {
	ctx, done, c, err := h.begin(ctx)
	if err != nil {
		return nil, err
	}
	defer done()
	tree, err := c.call(ctx, windowRequest(opQueryTree, c.root))
	if err != nil {
		return nil, err
	}
	count := int(le.Uint16(tree[16:]))
	if len(tree) < 32+4*count {
		return nil, ErrProtocol
	}
	kind, err := h.intern(ctx, c, "_NET_WM_WINDOW_TYPE")
	if err != nil {
		return nil, err
	}
	normal, err := h.intern(ctx, c, "_NET_WM_WINDOW_TYPE_NORMAL")
	if err != nil {
		return nil, err
	}
	var windows []Window
	for i := range count {
		id := le.Uint32(tree[32+4*i:])
		attrs, e := c.call(ctx, windowRequest(opGetWindowAttributes, id))
		if errors.Is(e, ErrProtocol) {
			continue
		}
		if e != nil {
			return nil, e
		}
		if len(attrs) < 28 || attrs[26] != mapStateViewable {
			continue
		}
		owned, e := h.ownsWindow(ctx, c, id, pid)
		if errors.Is(e, ErrProtocol) {
			continue
		}
		if e != nil {
			return nil, e
		}
		if !owned {
			continue
		}
		w, e := geometry(ctx, c, id)
		if errors.Is(e, ErrProtocol) {
			continue
		}
		if e != nil {
			return nil, e
		}
		types, e := c.call(ctx, getProperty(id, kind, 8))
		if e != nil {
			return nil, e
		}
		w.Normal = attrs[27] == 0
		if len(types) >= 36 && types[1] == 32 {
			w.Normal = le.Uint32(types[32:]) == normal
		}
		windows = append(windows, w)
	}
	return windows, nil
}

// FitWindows fills the visible area with normal windows and confines transient surfaces.
func FitWindows(windows []Window, size viewport.Size) []Window {
	result := append([]Window(nil), windows...)
	for i, w := range result {
		if w.Normal {
			w.X, w.Y, w.Width, w.Height = 0, 0, size.Width, size.Height
		} else {
			w.Width = min(w.Width, size.Width)
			w.Height = min(w.Height, size.Height)
			w.X = max(0, min(w.X, size.Width-w.Width))
			w.Y = max(0, min(w.Y, size.Height-w.Height))
		}
		result[i] = w
	}
	return result
}

// Configure rechecks server-attributed ownership before each native mutation.
func (h *Helper) Configure(ctx context.Context, pid int, windows []Window) error {
	ctx, done, c, err := h.begin(ctx)
	if err != nil {
		return err
	}
	defer done()
	for _, w := range windows {
		owned, e := h.ownsWindow(ctx, c, w.ID, pid)
		if e != nil {
			return e
		}
		if !owned || w.Width < 1 || w.Height < 1 || w.Width > viewport.Max || w.Height > viewport.Max {
			return ErrUnavailable
		}
		req := make([]byte, 28)
		req[0] = 12
		le.PutUint32(req[4:], w.ID)
		le.PutUint16(req[8:], 15)
		for i, v := range []int{w.X, w.Y, w.Width, w.Height} {
			le.PutUint32(req[12+4*i:], uint32(v))
		}
		if e = c.check(ctx, req); e != nil {
			return e
		}
	}
	return nil
}

// Workarea informs Chromium's native menus and dialogs of the exported bounds.
func (h *Helper) Workarea(ctx context.Context, size viewport.Size) error {
	if !size.Valid() {
		return ErrUnavailable
	}
	ctx, done, c, err := h.begin(ctx)
	if err != nil {
		return err
	}
	defer done()
	values := []struct {
		name string
		data []uint32
	}{{"_NET_WORKAREA", []uint32{0, 0, uint32(size.Width), uint32(size.Height)}}, {"_NET_CURRENT_DESKTOP", []uint32{0}}, {"_NET_NUMBER_OF_DESKTOPS", []uint32{1}}, {"_NET_DESKTOP_GEOMETRY", []uint32{uint32(size.Width), uint32(size.Height)}}}
	for _, value := range values {
		atom, e := h.intern(ctx, c, value.name)
		if e != nil {
			return e
		}
		if e = c.check(ctx, changeProperty(c.root, atom, 6, 32, atoms32(value.data...), false)); e != nil {
			return e
		}
	}
	return nil
}
