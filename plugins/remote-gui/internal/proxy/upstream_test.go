package proxy

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestChangedOwnershipAfterDialWritesNoUpstreamBytes(t *testing.T) {
	for _, upgrade := range []bool{false, true} {
		for _, changedBinding := range []bool{false, true} {
			name := "http"
			if upgrade {
				name = "websocket"
			}
			if changedBinding {
				name += "/listener-changed"
			} else {
				name += "/different-accepted-owner"
			}
			t.Run(name, func(t *testing.T) {
				var alive atomic.Bool
				alive.Store(true)
				public := httptest.NewUnstartedServer(nil)
				p, err := New(Options{
					ID: "0123456789abcdef0123456789abcdef", Origin: "http://" + public.Listener.Addr().String(),
					Target: "http://127.0.0.1:12345", Deadline: time.Now().Add(time.Minute), UpstreamAlive: alive.Load,
					UpstreamConnection: func(context.Context, net.Conn) bool { return changedBinding },
				})
				if err != nil {
					t.Fatal(err)
				}
				defer p.Revoke()
				observed := make(chan int, 1)
				dial := func(context.Context, string, string) (net.Conn, error) {
					client, server := net.Pipe()
					go func() {
						defer func() { _ = server.Close() }()
						_ = server.SetReadDeadline(time.Now().Add(2 * time.Second))
						body, _ := io.ReadAll(server)
						observed <- len(body)
					}()
					// The selected binding changed while establishing the connection.
					alive.Store(!changedBinding)
					return client, nil
				}
				p.reverse.Transport.(*http.Transport).DialContext = p.checkedDial(dial)
				public.Config.Handler = p
				public.Start()
				defer public.Close()
				grant, err := p.ProbeGrant()
				if err != nil {
					t.Fatal(err)
				}
				req, err := http.NewRequest(http.MethodGet, public.URL+"/synthetic-private-path", nil)
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
				if reply.StatusCode < 400 {
					t.Fatal("changed upstream remained usable")
				}
				select {
				case count := <-observed:
					if count != 0 {
						t.Fatalf("changed upstream received %d request bytes", count)
					}
				case <-time.After(3 * time.Second):
					t.Fatal("changed upstream connection was not closed")
				}
			})
		}
	}
}
