package session

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/proxy"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

func TestUpstreamReplacementBeforeDialIsRejected(t *testing.T) {
	for _, upgrade := range []bool{false, true} {
		name := "http"
		if upgrade {
			name = "websocket"
		}
		t.Run(name, func(t *testing.T) {
			original := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "original") }))
			defer original.Close()
			owner, inode, err := discover(original.URL)
			if err != nil {
				t.Fatal(err)
			}
			record := state.Record{Config: config.Config{Target: original.URL}, Upstream: owner, UpstreamSocket: inode}
			public := httptest.NewUnstartedServer(nil)
			var replacement atomic.Pointer[http.Server]
			defer func() {
				if server := replacement.Load(); server != nil {
					_ = server.Close()
				}
			}()
			var swapped atomic.Bool
			var requests atomic.Int64
			swapError := make(chan error, 1)
			p, err := proxy.New(proxy.Options{
				ID: "0123456789abcdef0123456789abcdef", Origin: "http://" + public.Listener.Addr().String(),
				Target: original.URL, Deadline: time.Now().Add(time.Minute),
				UpstreamAlive: func() bool {
					live := bindingAlive(record)
					if live && swapped.CompareAndSwap(false, true) {
						original.Close()
						listener, e := net.Listen("tcp", original.Listener.Addr().String())
						if e != nil {
							swapError <- e
							return false
						}
						server := &http.Server{ReadHeaderTimeout: time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
							requests.Add(1)
							_, _ = io.WriteString(w, "replacement")
						})}
						replacement.Store(server)
						go func() { _ = server.Serve(listener) }()
					}
					return live
				},
			})
			if err != nil {
				t.Fatal(err)
			}
			defer p.Revoke()
			public.Config.Handler = p
			public.Start()
			defer public.Close()
			grant, err := p.ProbeGrant()
			if err != nil {
				t.Fatal(err)
			}
			req, err := http.NewRequest(http.MethodGet, public.URL+"/", nil)
			if err != nil {
				t.Fatal(err)
			}
			req.AddCookie(grant.Cookie)
			req.Header.Set("Authorization", grant.Authorization)
			if upgrade {
				req.Header.Set("Origin", public.URL)
				req.Header.Set("Connection", "Upgrade")
				req.Header.Set("Upgrade", "websocket")
			}
			client := public.Client()
			client.Timeout = 3 * time.Second
			reply, err := client.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			_ = reply.Body.Close()
			select {
			case e := <-swapError:
				t.Fatal(e)
			default:
			}
			if !swapped.Load() || requests.Load() != 0 || reply.StatusCode < 400 {
				t.Fatal("replacement listener received an authorized request")
			}
		})
	}
}

func TestAddedReusePortListenerRevokesBinding(t *testing.T) {
	const linuxReusePort = 15
	lc := net.ListenConfig{Control: func(_, _ string, c syscall.RawConn) error {
		var optionError error
		err := c.Control(func(fd uintptr) {
			optionError = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_REUSEADDR, 1)
			if optionError == nil {
				optionError = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, linuxReusePort, 1)
			}
		})
		return errors.Join(err, optionError)
	}}
	first, err := lc.Listen(context.Background(), "tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = first.Close() }()
	address := "http://" + first.Addr().String()
	owner, inode, err := discover(address)
	if err != nil {
		t.Fatal(err)
	}
	record := state.Record{Config: config.Config{Target: address}, Upstream: owner, UpstreamSocket: inode}
	if !bindingAlive(record) {
		t.Fatal("original binding was not live")
	}
	second, err := lc.Listen(context.Background(), "tcp4", first.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = second.Close() }()
	inodes, err := listenerInodes(address)
	if err != nil || len(inodes) != 2 {
		t.Fatalf("expected two distinct listeners: %v, %v", inodes, err)
	}
	if _, _, err = discover(address); err == nil {
		t.Fatal("discovery accepted ambiguous listeners")
	}
	if bindingAlive(record) {
		t.Fatal("ambiguous target retained its existing authorization")
	}
	remaining, err := listenerInodes(address)
	if err != nil || len(remaining) != 2 {
		t.Fatal("validation changed the original or added listener")
	}
}
