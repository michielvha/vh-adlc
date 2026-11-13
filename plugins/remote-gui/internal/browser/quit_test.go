package browser

import (
	"context"
	"encoding/binary"
	"io"
	"net"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

// menuDouble opens its menu on the given poll, or never when opensAt is 0.
type menuDouble struct {
	clipboardDouble
	mu      sync.Mutex
	opensAt int
	polls   int
	open    bool
	onOpen  func()
}

func (d *menuDouble) Menus(context.Context) (map[uint32]bool, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.polls++
	if d.opensAt > 0 && d.polls >= d.opensAt && !d.open {
		d.open = true
		if d.onOpen != nil {
			d.onOpen()
		}
	}
	if d.open {
		return map[uint32]bool{7: true}, nil
	}
	return map[uint32]bool{}, nil
}

func (d *menuDouble) isOpen() bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.open
}

type keyEvent struct {
	down     bool
	key      uint32
	menuOpen bool
}

// fakeVNC accepts one RFB client that passes any password response and
// records its key events, with whether the menu was open when each arrived.
func fakeVNC(t *testing.T, menus *menuDouble) (string, <-chan []keyEvent) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	events := make(chan []keyEvent, 1)
	go func() {
		var got []keyEvent
		defer func() { events <- got }()
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()
		_, _ = io.WriteString(conn, "RFB 003.008\n")
		var version [12]byte
		var choice [1]byte
		var response [16]byte
		var shared [1]byte
		if _, err = io.ReadFull(conn, version[:]); err != nil {
			return
		}
		_, _ = conn.Write([]byte{1, 2})
		if _, err = io.ReadFull(conn, choice[:]); err != nil {
			return
		}
		_, _ = conn.Write(make([]byte, 16))
		if _, err = io.ReadFull(conn, response[:]); err != nil {
			return
		}
		_, _ = conn.Write([]byte{0, 0, 0, 0})
		if _, err = io.ReadFull(conn, shared[:]); err != nil {
			return
		}
		_, _ = conn.Write(make([]byte, 24))
		for {
			var event [8]byte
			if _, err = io.ReadFull(conn, event[:]); err != nil {
				return
			}
			got = append(got, keyEvent{event[1] == 1, binary.BigEndian.Uint32(event[4:]), menus.isOpen()})
		}
	}()
	return listener.Addr().String(), events
}

func quitRuntime(t *testing.T, menus *menuDouble) (*runtime, <-chan []keyEvent) {
	t.Helper()
	address, events := fakeVNC(t, menus)
	self, err := state.Inspect(os.Getpid())
	if err != nil {
		t.Fatal(err)
	}
	r := &runtime{vncAddress: address, clip: menus, children: []*child{{role: "vnc", identity: self}}}
	r.current.Password = "secret"
	return r, events
}

func TestQuitTypesExitOnlyIntoAnOpenMenu(t *testing.T) {
	menus := &menuDouble{opensAt: 8}
	r, events := quitRuntime(t, menus)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := r.quitBrowser(ctx); err != nil {
		t.Fatal(err)
	}
	got := <-events
	exit := false
	for _, event := range got {
		if event.key == 'x' {
			exit = true
			if !event.menuOpen {
				t.Fatal("Exit mnemonic typed before the menu opened")
			}
		}
	}
	if !exit || len(got) != 6 {
		t.Fatalf("quit keys: %+v", got)
	}
}

func TestQuitTypesNoExitWhenTheMenuStaysClosed(t *testing.T) {
	menus := &menuDouble{}
	r, events := quitRuntime(t, menus)
	ctx, cancel := context.WithTimeout(context.Background(), 400*time.Millisecond)
	defer cancel()
	if err := r.quitBrowser(ctx); err == nil {
		t.Fatal("quit reported success without an open menu")
	}
	for _, event := range <-events {
		if event.key == 'x' {
			t.Fatal("Exit mnemonic typed without an open menu")
		}
	}
}

// A cancellation that arrives with a successful menu reply must still stop the quit.
func TestQuitTypesNoExitAfterCancellation(t *testing.T) {
	menus := &menuDouble{opensAt: 3}
	r, events := quitRuntime(t, menus)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	menus.onOpen = cancel
	if err := r.quitBrowser(ctx); err == nil {
		t.Fatal("quit reported success after cancellation")
	}
	for _, event := range <-events {
		if event.key == 'x' {
			t.Fatal("Exit mnemonic typed after cancellation")
		}
	}
}
