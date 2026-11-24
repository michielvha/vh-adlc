package xclip

import "context"

func focusRequest() []byte { return []byte{opGetInputFocus, 0, 0, 0} }

// Focused observes server-attributed input focus without reading browser content.
func (h *Helper) Focused(ctx context.Context, pid int) (bool, error) {
	ctx, done, c, err := h.begin(ctx)
	if err != nil {
		return false, err
	}
	defer done()
	reply, err := c.call(ctx, focusRequest())
	if err != nil {
		return false, err
	}
	id := le.Uint32(reply[8:])
	if id <= 1 || id == c.root {
		return false, nil
	}
	actual, err := clientPID(ctx, c, id)
	return actual == pid, err
}

// RestoreFocus handles the focus vacuum left when an owned popup closes on an
// unmanaged Xvfb display. A valid focus, including another client's, is untouched.
func (h *Helper) RestoreFocus(ctx context.Context, pid int, windows []Window) (bool, error) {
	ctx, done, c, err := h.begin(ctx)
	if err != nil {
		return false, err
	}
	defer done()
	if err = ctx.Err(); err != nil {
		return false, err
	}
	// The server grab makes the check/set conditional atomic with respect to other
	// X clients. No subprocess or foreign client response is awaited while held.
	defer func() {
		if e := c.send([]byte{37, 0, 0, 0}); e != nil {
			c.close()
		}
	}()
	if err = c.check(ctx, []byte{36, 0, 0, 0}); err != nil {
		return false, err
	}
	reply, err := c.call(ctx, focusRequest())
	if err != nil {
		return false, err
	}
	current := le.Uint32(reply[8:])
	if current > 1 && current != c.root {
		return false, nil
	}
	// Menus can temporarily leave focus on the root while using a pointer grab.
	// Recheck under the server grab: one may have mapped since the caller's snapshot.
	currentWindows, err := h.windows(ctx, c, pid)
	if err != nil {
		return false, err
	}
	for _, w := range currentWindows {
		if !w.Normal {
			return false, nil
		}
	}
	candidates := make(map[uint32]bool)
	for _, w := range windows {
		if w.Normal {
			candidates[w.ID] = true
		}
	}
	tree, err := c.call(ctx, windowRequest(opQueryTree, c.root))
	if err != nil {
		return false, err
	}
	count := int(le.Uint16(tree[16:]))
	if len(tree) < 32+4*count {
		return false, ErrProtocol
	}
	for i := count - 1; i >= 0; i-- {
		id := le.Uint32(tree[32+4*i:])
		if !candidates[id] {
			continue
		}
		owned, e := h.ownsWindow(ctx, c, id, pid)
		if e != nil {
			return false, e
		}
		if !owned {
			continue
		}
		attrs, e := c.call(ctx, windowRequest(opGetWindowAttributes, id))
		if e != nil {
			return false, e
		}
		if len(attrs) < 28 || attrs[26] != mapStateViewable {
			continue
		}
		if e = ctx.Err(); e != nil {
			return false, e
		}
		request := make([]byte, 12)
		request[0] = 42
		request[1] = 1
		le.PutUint32(request[4:], id)
		if e = c.check(ctx, request); e != nil {
			return false, e
		}
		return true, nil
	}
	return false, nil
}
