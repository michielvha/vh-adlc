// Package xclip is a minimal X11 client, written with the standard library only,
// that sets, reads and clears the CLIPBOARD selection of one display.
//
// It never logs clipboard text, and its errors carry fixed diagnostic codes only.
package xclip

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// MaxText is the largest clipboard text, in bytes of UTF-8, carried in either direction.
const MaxText = 64 << 10

const opTimeout = 3 * time.Second

var (
	ErrTooLarge        = errors.New("clipboard-too-large")
	ErrClearUnverified = errors.New("clipboard-clear-unverified")
	ErrInvalidText     = errors.New("clipboard-text-invalid")
	ErrOwnership       = errors.New("clipboard-ownership-unverified")
	ErrTimeout         = errors.New("clipboard-timed-out")
	ErrUnavailable     = errors.New("clipboard-display-unavailable")
	ErrRefused         = errors.New("clipboard-display-refused")
	ErrProtocol        = errors.New("clipboard-protocol-error")
)

// Display names an X display socket and the Xauthority file holding its cookie.
// An empty Socket means the standard socket for Number.
type Display struct {
	Number    int
	Socket    string
	Authority string
}

type names struct {
	clipboard, targets, utf8, text, incr, transfer, stamp uint32
}

// answerFunc replaces the standard selection answers; tests use it to act as a misbehaving owner.
type answerFunc func(target uint32) (kind uint32, format byte, data []byte, ok bool)

// Helper keeps one X connection with an unmapped window. While it owns a
// selection it holds the text in memory and answers requests for it.
type Helper struct {
	display Display
	op      sync.Mutex // serializes operations
	atoms   map[string]uint32

	mu      sync.Mutex // guards the fields below, shared with the event goroutine
	c       *conn
	window  uint32
	names   names
	held    map[uint32]string
	ownedAt map[uint32]uint32
	answer  answerFunc
	closed  bool

	stamps  chan uint32
	notices chan packet
}

// Open connects to the display and prepares the helper's window.
func Open(ctx context.Context, d Display) (*Helper, error) {
	h := &Helper{display: d, atoms: make(map[string]uint32), held: make(map[uint32]string), ownedAt: make(map[uint32]uint32), stamps: make(chan uint32, 1), notices: make(chan packet, 1)}
	ctx, cancel := context.WithTimeout(ctx, opTimeout)
	defer cancel()
	h.op.Lock()
	defer h.op.Unlock()
	if _, err := h.connection(ctx); err != nil {
		return nil, err
	}
	return h, nil
}

// Close drops any held text and closes the connection, which releases the helper's selections.
func (h *Helper) Close() error {
	h.mu.Lock()
	h.closed = true
	h.held, h.ownedAt = make(map[uint32]string), make(map[uint32]uint32)
	c := h.c
	h.mu.Unlock()
	if c != nil {
		c.close()
	}
	return nil
}

// connection returns the live connection, reconnecting once the old one is gone.
// The caller holds h.op.
func (h *Helper) connection(ctx context.Context) (*conn, error) {
	h.mu.Lock()
	c, closed := h.c, h.closed
	h.mu.Unlock()
	if closed {
		return nil, ErrUnavailable
	}
	if c != nil && !c.closed() {
		return c, nil
	}
	c, err := dial(ctx, h.display, h.event)
	if err != nil {
		return nil, err
	}
	h.atoms = make(map[string]uint32)
	var n names
	for _, item := range []struct {
		name string
		into *uint32
	}{{"CLIPBOARD", &n.clipboard}, {"TARGETS", &n.targets}, {"UTF8_STRING", &n.utf8}, {"TEXT", &n.text}, {"INCR", &n.incr}, {"REMOTE_GUI_CLIPBOARD", &n.transfer}, {"REMOTE_GUI_TIMESTAMP", &n.stamp}} {
		reply, e := c.call(ctx, internAtom(item.name))
		if e != nil {
			c.close()
			return nil, e
		}
		*item.into = le.Uint32(reply[8:])
		h.atoms[item.name] = *item.into
	}
	window := c.id()
	if err = c.check(ctx, createWindow(window, c.root, propertyChangeMask)); err != nil {
		c.close()
		return nil, err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		c.close()
		return nil, ErrUnavailable
	}
	h.c, h.window, h.names = c, window, n
	h.held, h.ownedAt = make(map[uint32]string), make(map[uint32]uint32)
	return c, nil
}

func (h *Helper) begin(ctx context.Context) (context.Context, context.CancelFunc, *conn, error) {
	ctx, cancel := context.WithTimeout(ctx, opTimeout)
	h.op.Lock()
	c, err := h.connection(ctx)
	if err != nil {
		h.op.Unlock()
		cancel()
		return nil, nil, nil, err
	}
	return ctx, func() { h.op.Unlock(); cancel() }, c, nil
}

func (h *Helper) atom(ctx context.Context, name string) (uint32, error) {
	ctx, done, c, err := h.begin(ctx)
	if err != nil {
		return 0, err
	}
	defer done()
	return h.intern(ctx, c, name)
}

func (h *Helper) intern(ctx context.Context, c *conn, name string) (uint32, error) {
	switch name {
	case "PRIMARY":
		return atomPrimary, nil
	case "STRING":
		return atomString, nil
	case "CUT_BUFFER0":
		return atomCutBuffer0, nil
	}
	if a, ok := h.atoms[name]; ok {
		return a, nil
	}
	reply, err := c.call(ctx, internAtom(name))
	if err != nil {
		return 0, err
	}
	a := le.Uint32(reply[8:])
	h.atoms[name] = a
	return a, nil
}

func (h *Helper) setAnswer(f answerFunc) {
	h.mu.Lock()
	h.answer = f
	h.mu.Unlock()
}

// timestamp reads a server time from the PropertyNotify of a zero-length append.
func (h *Helper) timestamp(ctx context.Context, c *conn) (uint32, error) {
	select {
	case <-h.stamps:
	default:
	}
	h.mu.Lock()
	window, stamp := h.window, h.names.stamp
	h.mu.Unlock()
	if err := c.send(changeProperty(window, stamp, atomString, 8, nil, true)); err != nil {
		return 0, err
	}
	select {
	case t := <-h.stamps:
		return t, nil
	case <-ctx.Done():
		return 0, ErrTimeout
	case <-c.done:
		return 0, ErrUnavailable
	}
}

// Set makes text the CLIPBOARD selection, held in memory until another client takes it.
func (h *Helper) Set(ctx context.Context, text string) error {
	if len(text) > MaxText {
		return ErrTooLarge
	}
	if !utf8.ValidString(text) {
		return ErrInvalidText
	}
	return h.own(ctx, "CLIPBOARD", text)
}

func (h *Helper) own(ctx context.Context, selection, text string) error {
	ctx, done, c, err := h.begin(ctx)
	if err != nil {
		return err
	}
	defer done()
	sel, err := h.intern(ctx, c, selection)
	if err != nil {
		return err
	}
	t, err := h.timestamp(ctx, c)
	if err != nil {
		return err
	}
	h.mu.Lock()
	window := h.window
	h.held[sel], h.ownedAt[sel] = text, t
	h.mu.Unlock()
	drop := func() {
		h.mu.Lock()
		delete(h.held, sel)
		h.mu.Unlock()
	}
	if err = c.check(ctx, setSelectionOwner(window, sel, t)); err != nil {
		drop()
		return err
	}
	owner, err := h.owner(ctx, c, sel)
	if err != nil || owner != window {
		drop()
		if err != nil {
			return err
		}
		return ErrOwnership
	}
	return nil
}

// Get returns the CLIPBOARD text. Held text returns without a round trip, and no owner returns "".
func (h *Helper) Get(ctx context.Context) (string, error) {
	ctx, done, c, err := h.begin(ctx)
	if err != nil {
		return "", err
	}
	defer done()
	h.mu.Lock()
	n, window := h.names, h.window
	h.mu.Unlock()
	// The owner query is answered by the server, so asking it while this
	// helper owns the selection cannot wait on the helper's own answer.
	owner, err := h.owner(ctx, c, n.clipboard)
	if err != nil || owner == atomNone {
		return "", err
	}
	if owner == window {
		h.mu.Lock()
		text, holding := h.held[n.clipboard]
		h.mu.Unlock()
		if !holding {
			return "", nil
		}
		return text, nil
	}
	text, refused, err := h.convert(ctx, c, n.utf8)
	if err != nil || !refused {
		return text, err
	}
	text, refused, err = h.convert(ctx, c, atomString)
	if err != nil || refused {
		return "", err
	}
	return text, nil
}

func (h *Helper) convert(ctx context.Context, c *conn, target uint32) (string, bool, error) {
	select {
	case <-h.notices:
	default:
	}
	t, err := h.timestamp(ctx, c)
	if err != nil {
		return "", false, err
	}
	h.mu.Lock()
	window, n := h.window, h.names
	h.mu.Unlock()
	if err = c.send(convertSelection(window, n.clipboard, target, n.transfer, t)); err != nil {
		return "", false, err
	}
	var notice packet
	for notice == nil {
		select {
		case p := <-h.notices:
			if le.Uint32(p[12:]) == n.clipboard && le.Uint32(p[16:]) == target {
				notice = p
			}
		case <-ctx.Done():
			return "", false, ErrTimeout
		case <-c.done:
			return "", false, ErrUnavailable
		}
	}
	if le.Uint32(notice[20:]) == atomNone {
		return "", true, nil
	}
	reply, err := c.call(ctx, getProperty(window, n.transfer, MaxText/4+1))
	if err != nil {
		return "", false, err
	}
	if err = c.send(deleteProperty(window, n.transfer)); err != nil {
		return "", false, err
	}
	format, kind, after := reply[1], le.Uint32(reply[8:]), le.Uint32(reply[12:])
	size := int(le.Uint32(reply[16:]))
	if format != 0 {
		size *= int(format) / 8
	}
	if kind == n.incr {
		return "", false, ErrTooLarge
	}
	if size > len(reply)-32 {
		return "", false, ErrProtocol
	}
	if after > 0 || size > MaxText {
		return "", false, ErrTooLarge
	}
	if kind == atomNone {
		return "", true, nil
	}
	if format != 8 {
		return "", false, ErrInvalidText
	}
	data := reply[32 : 32+size]
	text := string(data)
	if kind == atomString {
		text = fromLatin1(data)
	} else {
		text = strings.ToValidUTF8(text, "�")
	}
	if len(text) > MaxText {
		return "", false, ErrTooLarge
	}
	return text, false, nil
}

// Clear leaves CLIPBOARD and PRIMARY without an owner, deletes CUT_BUFFER0,
// drops held text and verifies the result.
func (h *Helper) Clear(ctx context.Context) error {
	ctx, done, c, err := h.begin(ctx)
	if err != nil {
		return err
	}
	defer done()
	h.mu.Lock()
	h.held = make(map[uint32]string)
	n := h.names
	h.mu.Unlock()
	t, err := h.timestamp(ctx, c)
	if err != nil {
		return err
	}
	temporary := c.id()
	if err = c.check(ctx,
		createWindow(temporary, c.root, 0),
		setSelectionOwner(temporary, n.clipboard, t),
		setSelectionOwner(temporary, atomPrimary, t),
		deleteProperty(c.root, atomCutBuffer0),
		destroyWindow(temporary),
	); err != nil {
		return ErrClearUnverified
	}
	for _, selection := range []uint32{n.clipboard, atomPrimary} {
		owner, e := h.owner(ctx, c, selection)
		if e != nil || owner != atomNone {
			return ErrClearUnverified
		}
	}
	exists, err := h.cutBuffer(ctx, c)
	if err != nil || exists {
		return ErrClearUnverified
	}
	return nil
}

func (h *Helper) owner(ctx context.Context, c *conn, selection uint32) (uint32, error) {
	reply, err := c.call(ctx, getSelectionOwner(selection))
	if err != nil {
		return 0, err
	}
	return le.Uint32(reply[8:]), nil
}

func (h *Helper) cutBuffer(ctx context.Context, c *conn) (bool, error) {
	reply, err := c.call(ctx, getProperty(c.root, atomCutBuffer0, 0))
	if err != nil {
		return false, err
	}
	return le.Uint32(reply[8:]) != atomNone, nil
}

// Owner is a test probe: the window that owns the named selection, or 0 for none.
func (h *Helper) Owner(ctx context.Context, selection string) (uint32, error) {
	ctx, done, c, err := h.begin(ctx)
	if err != nil {
		return 0, err
	}
	defer done()
	sel, err := h.intern(ctx, c, selection)
	if err != nil {
		return 0, err
	}
	return h.owner(ctx, c, sel)
}

// CutBufferExists is a test probe: whether the root window has CUT_BUFFER0.
func (h *Helper) CutBufferExists(ctx context.Context) (bool, error) {
	ctx, done, c, err := h.begin(ctx)
	if err != nil {
		return false, err
	}
	defer done()
	return h.cutBuffer(ctx, c)
}

// SetPrimary is a test probe that makes text the PRIMARY selection, held by
// this connection.
func (h *Helper) SetPrimary(ctx context.Context, text string) error {
	if len(text) > MaxText {
		return ErrTooLarge
	}
	return h.own(ctx, "PRIMARY", text)
}

// SetCutBuffer is a test probe that writes CUT_BUFFER0 on the root window.
func (h *Helper) SetCutBuffer(ctx context.Context, text string) error {
	if len(text) > MaxText {
		return ErrTooLarge
	}
	ctx, done, c, err := h.begin(ctx)
	if err != nil {
		return err
	}
	defer done()
	return c.check(ctx, changeProperty(c.root, atomCutBuffer0, atomString, 8, toLatin1(text), false))
}

// event runs on the connection's event goroutine and never waits for a reply.
func (h *Helper) event(c *conn, p packet) {
	h.mu.Lock()
	current, window := h.c == c, h.window
	h.mu.Unlock()
	if !current {
		return
	}
	switch p[0] & 0x7f {
	case evPropertyNotify:
		h.mu.Lock()
		stamp := h.names.stamp
		h.mu.Unlock()
		if le.Uint32(p[4:]) == window && le.Uint32(p[8:]) == stamp {
			select {
			case h.stamps <- le.Uint32(p[12:]):
			default:
			}
		}
	case evSelectionNotify:
		if le.Uint32(p[8:]) == window {
			select {
			case h.notices <- p:
			default:
			}
		}
	case evSelectionClear:
		at, owner, selection := le.Uint32(p[4:]), le.Uint32(p[8:]), le.Uint32(p[12:])
		h.mu.Lock()
		// A clear that predates the current ownership belongs to an earlier one.
		if owner == window && int32(at-h.ownedAt[selection]) >= 0 {
			delete(h.held, selection)
		}
		h.mu.Unlock()
	case evSelectionRequest:
		h.serve(c, p, window)
	}
}

func (h *Helper) serve(c *conn, p packet, window uint32) {
	at, owner, requestor := le.Uint32(p[4:]), le.Uint32(p[8:]), le.Uint32(p[12:])
	selection, target, property := le.Uint32(p[16:]), le.Uint32(p[20:]), le.Uint32(p[24:])
	if property == atomNone {
		property = target
	}
	h.mu.Lock()
	text, ok := h.held[selection]
	since, answer, n := h.ownedAt[selection], h.answer, h.names
	h.mu.Unlock()
	ok = ok && owner == window && (at == 0 || int32(at-since) >= 0)
	var kind uint32
	var format byte
	var data []byte
	if ok && answer != nil {
		kind, format, data, ok = answer(target)
	} else if ok {
		switch target {
		case n.targets:
			kind, format, data = atomAtom, 32, atoms32(n.targets, n.utf8, atomString, n.text)
		case n.utf8, n.text:
			kind, format, data = n.utf8, 8, []byte(text)
		case atomString:
			kind, format, data = atomString, 8, toLatin1(text)
		default:
			ok = false
		}
	}
	if ok && c.send(changeProperty(requestor, property, kind, format, data, false)) != nil {
		return
	}
	if !ok {
		property = atomNone
	}
	_ = c.send(selectionNotify(at, requestor, selection, target, property))
}

func toLatin1(s string) []byte {
	out := make([]byte, 0, len(s))
	for _, r := range s {
		if r > 0xff {
			r = '?'
		}
		out = append(out, byte(r))
	}
	return out
}

func fromLatin1(b []byte) string {
	runes := make([]rune, len(b))
	for i, c := range b {
		runes[i] = rune(c)
	}
	return string(runes)
}
