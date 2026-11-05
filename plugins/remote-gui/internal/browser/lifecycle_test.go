package browser

import (
	"bufio"
	"context"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"syscall"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/session"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

func TestMain(m *testing.M) {
	session.BrowserLauncher = Start
	if handled, code := session.Internal(os.Args[1:]); handled {
		os.Exit(code)
	}
	os.Exit(m.Run())
}

func TestBrowserComponentsCrashAndExpire(t *testing.T) {
	if os.Getenv("REMOTE_GUI_BROWSER_E2E") != "1" {
		t.Skip("requires existing GUI dependencies and disposable browser processes")
	}
	for _, role := range []string{"display", "vnc", "viewer-bridge", "browser", "supervisor", "guard", "expiry"} {
		t.Run(role, func(t *testing.T) {
			home, err := os.MkdirTemp("/tmp", "rg-browser-life-")
			if err != nil {
				t.Fatal(err)
			}
			ttl := "1m"
			if role == "expiry" {
				ttl = "10s"
			}
			c, err := config.Parse([]string{"start", "--home", home, "--transport", "loopback", "--ttl", ttl})
			if err != nil {
				t.Fatal(err)
			}
			v, err := session.Start(c)
			if err != nil {
				t.Fatal(err)
			}
			defer func() {
				end, e := session.Stop(home, v.ID)
				if e == nil && end.State != "cleanup-pending" {
					_ = os.RemoveAll(home)
				} else {
					t.Log("retained owned browser cleanup record", home)
				}
			}()
			r, err := state.Load(home, v.ID)
			if err != nil {
				t.Fatal(err)
			}
			access, err := session.Access(home, v.ID, true)
			if err != nil {
				t.Fatal("test enrollment unavailable")
			}
			origin, _ := url.Parse(v.URL)
			request, _ := http.NewRequest(http.MethodGet, origin.Scheme+"://"+origin.Host+"/?__remote_gui_enroll=1", nil)
			request.SetBasicAuth("viewer", access.AccessCode)
			client := &http.Client{Timeout: time.Second, Transport: &http.Transport{Proxy: nil}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
			defer client.Transport.(*http.Transport).CloseIdleConnections()
			response, err := client.Do(request)
			if err != nil {
				t.Fatal("test enrollment failed")
			}
			_ = response.Body.Close()
			if response.StatusCode != 303 || len(response.Cookies()) != 1 {
				t.Fatal("test enrollment rejected")
			}
			socket, err := net.DialTimeout("tcp", origin.Host, time.Second)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = socket.Close() }()
			request, _ = http.NewRequest(http.MethodGet, origin.Scheme+"://"+origin.Host+"/websockify", nil)
			request.SetBasicAuth("viewer", access.AccessCode)
			request.AddCookie(response.Cookies()[0])
			request.Header.Set("Origin", origin.Scheme+"://"+origin.Host)
			request.Header.Set("Connection", "Upgrade")
			request.Header.Set("Upgrade", "websocket")
			request.Header.Set("Sec-WebSocket-Version", "13")
			request.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
			if err = request.Write(socket); err != nil {
				t.Fatal(err)
			}
			reader := bufio.NewReader(socket)
			upgrade, err := http.ReadResponse(reader, request)
			if err != nil || upgrade.StatusCode != 101 {
				t.Fatal("authenticated test upgrade failed")
			}
			if role != "expiry" {
				identity := r.Supervisor
				if role == "guard" {
					identity = r.Guard
				} else if role != "supervisor" {
					identity = state.Identity{}
					for _, owned := range r.Owned {
						if owned.Role == role {
							identity = owned.Identity
						}
					}
				}
				if identity.PID == 0 {
					t.Fatal("component identity missing")
				}
				if err = state.Signal(identity, syscall.SIGKILL); err != nil {
					t.Fatal(err)
				}
			}
			deadline := time.Now().Add(18 * time.Second)
			var end session.View
			for time.Now().Before(deadline) {
				end, err = session.Read(home, v.ID)
				if role == "guard" && err == nil && end.State == "cleanup-pending" {
					_, _ = session.Cleanup(context.Background(), home)
				}
				if err == nil && (end.State == "failed" || end.State == "stopped") {
					break
				}
				time.Sleep(30 * time.Millisecond)
			}
			if end.State != "failed" && end.State != "stopped" {
				t.Fatalf("browser cleanup state: %s (%s)", end.State, end.Diagnostic)
			}
			for _, owned := range r.Owned {
				if state.Alive(owned.Identity) {
					t.Fatalf("owned component survived: %s", owned.Role)
				}
			}
			entries, _ := os.ReadDir("/proc")
			for _, entry := range entries {
				pid, e := strconv.Atoi(entry.Name())
				if e != nil || pid == r.Guard.PID || pid == r.Supervisor.PID {
					continue
				}
				identity, e := state.Inspect(pid)
				if e == nil && identity.Session == r.Guard.Session && state.Alive(identity) {
					t.Fatal("private browser-session descendant survived cleanup")
				}
			}
			if _, err = os.Lstat(filepath.Join(home, v.ID, "profile")); !os.IsNotExist(err) {
				t.Fatal("private browser profile survived teardown")
			}
			_ = socket.SetReadDeadline(time.Now().Add(time.Second))
			if _, err = io.Copy(io.Discard, reader); err != nil {
				if timeout, ok := err.(net.Error); ok && timeout.Timeout() {
					t.Fatal("active viewer connection survived teardown")
				}
			}
			if _, err = session.Access(home, v.ID, true); err == nil {
				t.Fatal("ended browser issued a new access code")
			}
			_, _ = session.Cleanup(context.Background(), home)
		})
	}
}
