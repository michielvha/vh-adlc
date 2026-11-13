package xclip

import (
	"context"
	"errors"
)

const (
	opGetWindowAttributes = 3
	opQueryTree           = 15

	mapStateViewable = 2
)

// Menus returns the viewable top-level windows of the display that their
// client marks as a menu. The browser quit waits for one before it types the
// menu's Exit mnemonic, so that key never reaches a page.
func (h *Helper) Menus(ctx context.Context) (map[uint32]bool, error) {
	ctx, done, c, err := h.begin(ctx)
	if err != nil {
		return nil, err
	}
	defer done()
	kind, err := h.intern(ctx, c, "_NET_WM_WINDOW_TYPE")
	if err != nil {
		return nil, err
	}
	menu := make(map[uint32]bool)
	for _, name := range []string{"_NET_WM_WINDOW_TYPE_MENU", "_NET_WM_WINDOW_TYPE_POPUP_MENU", "_NET_WM_WINDOW_TYPE_DROPDOWN_MENU"} {
		a, e := h.intern(ctx, c, name)
		if e != nil {
			return nil, e
		}
		menu[a] = true
	}
	tree, err := c.call(ctx, windowRequest(opQueryTree, c.root))
	if err != nil {
		return nil, err
	}
	count := int(le.Uint16(tree[16:]))
	if len(tree) < 32+4*count {
		return nil, ErrProtocol
	}
	found := make(map[uint32]bool)
	for i := range count {
		window := le.Uint32(tree[32+4*i:])
		// A window destroyed after the tree reply answers with an error; skip it.
		attributes, e := c.call(ctx, windowRequest(opGetWindowAttributes, window))
		if errors.Is(e, ErrProtocol) {
			continue
		}
		if e != nil {
			return nil, e
		}
		if len(attributes) < 28 || attributes[26] != mapStateViewable {
			continue
		}
		reply, e := c.call(ctx, getProperty(window, kind, 16))
		if errors.Is(e, ErrProtocol) {
			continue
		}
		if e != nil {
			return nil, e
		}
		if reply[1] != 32 {
			continue
		}
		size := int(le.Uint32(reply[16:]))
		if len(reply) < 32+4*size {
			return nil, ErrProtocol
		}
		for j := range size {
			if menu[le.Uint32(reply[32+4*j:])] {
				found[window] = true
			}
		}
	}
	return found, nil
}

func windowRequest(opcode byte, window uint32) []byte {
	b := make([]byte, 8)
	b[0] = opcode
	le.PutUint32(b[4:], window)
	return b
}
