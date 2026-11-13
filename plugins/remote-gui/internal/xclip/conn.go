package xclip

import (
	"bufio"
	"context"
	"encoding/binary"
	"io"
	"net"
	"os"
	"strconv"
	"sync"
	"time"
)

var le = binary.LittleEndian

const (
	opCreateWindow      = 1
	opDestroyWindow     = 4
	opInternAtom        = 16
	opChangeProperty    = 18
	opDeleteProperty    = 19
	opGetProperty       = 20
	opSetSelectionOwner = 22
	opGetSelectionOwner = 23
	opConvertSelection  = 24
	opSendEvent         = 25
	opGetInputFocus     = 43

	evPropertyNotify   = 28
	evSelectionClear   = 29
	evSelectionRequest = 30
	evSelectionNotify  = 31
	evGeneric          = 35

	atomNone       = 0
	atomPrimary    = 1
	atomAtom       = 4
	atomCutBuffer0 = 9
	atomString     = 31

	propertyChangeMask = 0x400000
	maxPacket          = 1 << 20
)

type packet []byte

// conn is one X11 connection. A reader goroutine routes replies and errors to
// waiting requests by sequence number and queues events for a separate event
// goroutine, so serving a selection request never blocks reading.
type conn struct {
	nc         net.Conn
	root       uint32
	idBase     uint32
	idMask     uint32
	maxRequest int

	writeMu sync.Mutex
	seq     uint16
	nextID  uint32

	mu      sync.Mutex
	pending map[uint16]chan packet
	queue   []packet
	wake    chan struct{}

	done      chan struct{}
	closeOnce sync.Once
}

func pad4(n int) int { return (4 - n%4) % 4 }

// cookie returns the MIT-MAGIC-COOKIE-1 for the display from an Xauthority file.
func cookie(authority string, number int) ([]byte, error) {
	b, err := os.ReadFile(authority)
	if err != nil {
		return nil, ErrUnavailable
	}
	be := binary.BigEndian
	want := strconv.Itoa(number)
	field := func() ([]byte, bool) {
		if len(b) < 2 {
			return nil, false
		}
		n := int(be.Uint16(b))
		if len(b) < 2+n {
			return nil, false
		}
		f := b[2 : 2+n]
		b = b[2+n:]
		return f, true
	}
	for len(b) >= 2 {
		b = b[2:]
		_, ok1 := field()
		num, ok2 := field()
		name, ok3 := field()
		data, ok4 := field()
		if !ok1 || !ok2 || !ok3 || !ok4 {
			break
		}
		if string(name) == "MIT-MAGIC-COOKIE-1" && (string(num) == want || len(num) == 0) {
			return data, nil
		}
	}
	return nil, ErrUnavailable
}

func dial(ctx context.Context, d Display, events func(*conn, packet)) (*conn, error) {
	secret, err := cookie(d.Authority, d.Number)
	if err != nil {
		return nil, err
	}
	socket := d.Socket
	if socket == "" {
		socket = "/tmp/.X11-unix/X" + strconv.Itoa(d.Number)
	}
	nc, err := (&net.Dialer{}).DialContext(ctx, "unix", socket)
	if err != nil {
		return nil, ErrUnavailable
	}
	deadline := time.Now().Add(opTimeout)
	if limit, ok := ctx.Deadline(); ok && limit.Before(deadline) {
		deadline = limit
	}
	_ = nc.SetDeadline(deadline)
	const name = "MIT-MAGIC-COOKIE-1"
	setup := make([]byte, 12, 12+len(name)+3+len(secret)+3)
	setup[0] = 'l'
	le.PutUint16(setup[2:], 11)
	le.PutUint16(setup[6:], uint16(len(name)))
	le.PutUint16(setup[8:], uint16(len(secret)))
	setup = append(setup, name...)
	setup = append(setup, make([]byte, pad4(len(name)))...)
	setup = append(setup, secret...)
	setup = append(setup, make([]byte, pad4(len(secret)))...)
	if _, err = nc.Write(setup); err != nil {
		_ = nc.Close()
		return nil, ErrUnavailable
	}
	r := bufio.NewReader(nc)
	header := make([]byte, 8)
	if _, err = io.ReadFull(r, header); err != nil {
		_ = nc.Close()
		return nil, ErrUnavailable
	}
	body := make([]byte, int(le.Uint16(header[6:]))*4)
	if _, err = io.ReadFull(r, body); err != nil {
		_ = nc.Close()
		return nil, ErrUnavailable
	}
	if header[0] != 1 {
		_ = nc.Close()
		return nil, ErrRefused
	}
	if len(body) < 32 {
		_ = nc.Close()
		return nil, ErrProtocol
	}
	vendor := int(le.Uint16(body[16:]))
	formats := int(body[21])
	screen := 32 + vendor + pad4(vendor) + 8*formats
	if len(body) < screen+4 {
		_ = nc.Close()
		return nil, ErrProtocol
	}
	_ = nc.SetDeadline(time.Time{})
	c := &conn{
		nc:         nc,
		root:       le.Uint32(body[screen:]),
		idBase:     le.Uint32(body[4:]),
		idMask:     le.Uint32(body[8:]),
		maxRequest: int(le.Uint16(body[18:])) * 4,
		pending:    make(map[uint16]chan packet),
		wake:       make(chan struct{}, 1),
		done:       make(chan struct{}),
	}
	go c.read(r)
	go c.dispatch(events)
	return c, nil
}

func (c *conn) read(r *bufio.Reader) {
	defer c.close()
	for {
		p := make(packet, 32)
		if _, err := io.ReadFull(r, p); err != nil {
			return
		}
		if p[0] == 1 || p[0]&0x7f == evGeneric {
			extra := int(le.Uint32(p[4:])) * 4
			if extra < 0 || extra > maxPacket {
				return
			}
			p = append(p, make([]byte, extra)...)
			if _, err := io.ReadFull(r, p[32:]); err != nil {
				return
			}
		}
		c.mu.Lock()
		if p[0] <= 1 {
			seq := le.Uint16(p[2:])
			if waiter, ok := c.pending[seq]; ok {
				delete(c.pending, seq)
				waiter <- p
			}
		} else {
			c.queue = append(c.queue, p)
			select {
			case c.wake <- struct{}{}:
			default:
			}
		}
		c.mu.Unlock()
	}
}

func (c *conn) dispatch(events func(*conn, packet)) {
	for {
		select {
		case <-c.done:
			return
		case <-c.wake:
		}
		for {
			c.mu.Lock()
			if len(c.queue) == 0 {
				c.mu.Unlock()
				break
			}
			p := c.queue[0]
			c.queue = c.queue[1:]
			c.mu.Unlock()
			events(c, p)
		}
	}
}

func (c *conn) close() {
	c.closeOnce.Do(func() {
		_ = c.nc.Close()
		close(c.done)
	})
}

func (c *conn) closed() bool {
	select {
	case <-c.done:
		return true
	default:
		return false
	}
}

func (c *conn) id() uint32 {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	c.nextID++
	return c.idBase | (c.nextID & c.idMask)
}

// write sends one request. A non-nil waiter receives its reply or error.
func (c *conn) write(req []byte, waiter chan packet) (uint16, error) {
	if len(req)%4 != 0 || len(req) > c.maxRequest {
		return 0, ErrTooLarge
	}
	le.PutUint16(req[2:], uint16(len(req)/4))
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	if c.closed() {
		return 0, ErrUnavailable
	}
	c.seq++
	seq := c.seq
	if waiter != nil {
		c.mu.Lock()
		c.pending[seq] = waiter
		c.mu.Unlock()
	}
	_ = c.nc.SetWriteDeadline(time.Now().Add(opTimeout))
	if _, err := c.nc.Write(req); err != nil {
		c.forget(seq)
		c.close()
		return 0, ErrUnavailable
	}
	return seq, nil
}

func (c *conn) forget(seq uint16) {
	c.mu.Lock()
	delete(c.pending, seq)
	c.mu.Unlock()
}

func (c *conn) send(req []byte) error {
	_, err := c.write(req, nil)
	return err
}

func (c *conn) await(ctx context.Context, seq uint16, waiter chan packet) (packet, error) {
	select {
	case p := <-waiter:
		if p[0] == 0 {
			return nil, ErrProtocol
		}
		return p, nil
	case <-ctx.Done():
		c.forget(seq)
		return nil, ErrTimeout
	case <-c.done:
		return nil, ErrUnavailable
	}
}

// call sends a request that has a reply and waits for it.
func (c *conn) call(ctx context.Context, req []byte) (packet, error) {
	waiter := make(chan packet, 1)
	seq, err := c.write(req, waiter)
	if err != nil {
		return nil, err
	}
	return c.await(ctx, seq, waiter)
}

// check sends requests without replies, then a round trip. Errors for earlier
// requests always arrive before that reply, so any error is reported.
func (c *conn) check(ctx context.Context, reqs ...[]byte) error {
	type sent struct {
		seq    uint16
		waiter chan packet
	}
	var all []sent
	defer func() {
		for _, s := range all {
			c.forget(s.seq)
		}
	}()
	for _, req := range reqs {
		waiter := make(chan packet, 1)
		seq, err := c.write(req, waiter)
		if err != nil {
			return err
		}
		all = append(all, sent{seq, waiter})
	}
	sync := make([]byte, 4)
	sync[0] = opGetInputFocus
	if _, err := c.call(ctx, sync); err != nil {
		return err
	}
	for _, s := range all {
		select {
		case <-s.waiter:
			return ErrProtocol
		default:
		}
	}
	return nil
}

func internAtom(name string) []byte {
	b := make([]byte, 8, 8+len(name)+3)
	b[0] = opInternAtom
	le.PutUint16(b[4:], uint16(len(name)))
	b = append(b, name...)
	return append(b, make([]byte, pad4(len(name)))...)
}

func createWindow(id, parent uint32, eventMask uint32) []byte {
	b := make([]byte, 36)
	b[0] = opCreateWindow
	le.PutUint32(b[4:], id)
	le.PutUint32(b[8:], parent)
	le.PutUint16(b[16:], 1)
	le.PutUint16(b[18:], 1)
	le.PutUint16(b[22:], 2) // InputOnly, never mapped
	le.PutUint32(b[28:], 0x800)
	le.PutUint32(b[32:], eventMask)
	return b
}

func destroyWindow(id uint32) []byte {
	b := make([]byte, 8)
	b[0] = opDestroyWindow
	le.PutUint32(b[4:], id)
	return b
}

// changeProperty replaces a property, or appends to it when appendOnly is set.
func changeProperty(window, property, kind uint32, format byte, data []byte, appendOnly bool) []byte {
	b := make([]byte, 24, 24+len(data)+3)
	b[0] = opChangeProperty
	if appendOnly {
		b[1] = 2
	}
	le.PutUint32(b[4:], window)
	le.PutUint32(b[8:], property)
	le.PutUint32(b[12:], kind)
	b[16] = format
	if format != 0 {
		le.PutUint32(b[20:], uint32(len(data)/(int(format)/8)))
	}
	b = append(b, data...)
	return append(b, make([]byte, pad4(len(data)))...)
}

func deleteProperty(window, property uint32) []byte {
	b := make([]byte, 12)
	b[0] = opDeleteProperty
	le.PutUint32(b[4:], window)
	le.PutUint32(b[8:], property)
	return b
}

func getProperty(window, property uint32, longLength uint32) []byte {
	b := make([]byte, 24)
	b[0] = opGetProperty
	le.PutUint32(b[4:], window)
	le.PutUint32(b[8:], property)
	le.PutUint32(b[20:], longLength)
	return b
}

func setSelectionOwner(window, selection, time uint32) []byte {
	b := make([]byte, 16)
	b[0] = opSetSelectionOwner
	le.PutUint32(b[4:], window)
	le.PutUint32(b[8:], selection)
	le.PutUint32(b[12:], time)
	return b
}

func getSelectionOwner(selection uint32) []byte {
	b := make([]byte, 8)
	b[0] = opGetSelectionOwner
	le.PutUint32(b[4:], selection)
	return b
}

func convertSelection(requestor, selection, target, property, time uint32) []byte {
	b := make([]byte, 24)
	b[0] = opConvertSelection
	le.PutUint32(b[4:], requestor)
	le.PutUint32(b[8:], selection)
	le.PutUint32(b[12:], target)
	le.PutUint32(b[16:], property)
	le.PutUint32(b[20:], time)
	return b
}

func selectionNotify(time, requestor, selection, target, property uint32) []byte {
	b := make([]byte, 12, 44)
	b[0] = opSendEvent
	le.PutUint32(b[4:], requestor)
	event := make([]byte, 32)
	event[0] = evSelectionNotify
	le.PutUint32(event[4:], time)
	le.PutUint32(event[8:], requestor)
	le.PutUint32(event[12:], selection)
	le.PutUint32(event[16:], target)
	le.PutUint32(event[20:], property)
	return append(b, event...)
}

func atoms32(values ...uint32) []byte {
	b := make([]byte, 4*len(values))
	for i, v := range values {
		le.PutUint32(b[4*i:], v)
	}
	return b
}
