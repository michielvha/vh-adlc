package session

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

func TestTailnetSessionPinsOwnerAndPrivateBackend(t *testing.T) {
	home := root(t)
	_ = fakeTailnet(t, home)
	app := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "owner-app") }))
	defer app.Close()
	c := options(t, home, app.URL, "1m")
	c.Transport = "tailscale"
	v, err := Start(c)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = Stop(home, v.ID) }()
	r, err := state.Load(home, v.ID)
	if err != nil {
		t.Fatal(err)
	}
	if v.AuthMode != "tailscale-identity" || v.OwnerLogin != "owner@example.test" || r.ProxyNetwork != "unix" || r.ProxySocket == nil || !r.ServePeer.Alive() {
		t.Fatal("owner/daemon/private listener not pinned")
	}
	info, err := os.Lstat(r.ProxyAddress)
	if err != nil || info.Mode()&os.ModeSocket == 0 || info.Mode().Perm() != 0o600 {
		t.Fatal("private backend socket missing")
	}
	access, err := Access(home, v.ID, true)
	if err != nil || access.AccessCode != "" || access.EnrollmentExpires != nil || access.AuthMode != "tailscale-identity" {
		t.Fatal("identity access issued enrollment material")
	}
	pool, err := x509.SystemCertPool()
	if err != nil {
		t.Fatal(err)
	}
	transport := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport}
	response, err := client.Get(v.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != 200 || string(body) != "owner-app" || response.Header.Get("WWW-Authenticate") != "" {
		t.Fatal("owner could not open app directly")
	}
}

func TestChangedPrivateSocketPathIsPreserved(t *testing.T) {
	home := root(t)
	_ = fakeTailnet(t, home)
	app := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "keep-app") }))
	defer app.Close()
	c := options(t, home, app.URL, "1m")
	c.Transport = "tailscale"
	v, err := Start(c)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = Stop(home, v.ID) }()
	record, err := state.Load(home, v.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Remove(record.ProxyAddress); err != nil {
		t.Fatal(err)
	}
	foreign, err := net.ListenUnix("unix", &net.UnixAddr{Name: record.ProxyAddress, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	foreign.SetUnlinkOnClose(false)
	defer func() {
		_ = foreign.Close()
		_ = os.Remove(record.ProxyAddress)
		_, _ = Cleanup(context.Background(), home)
	}()
	if err = os.Chmod(record.ProxyAddress, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err = Stop(home, v.ID); err != nil {
		t.Fatal(err)
	}
	end := waitEnd(t, home, v.ID)
	if end.State != "cleanup-pending" {
		t.Fatal("changed private socket ownership was reported cleaned")
	}
	if _, err = os.Lstat(record.ProxyAddress); err != nil {
		t.Fatal("foreign Unix socket was deleted")
	}
	response, err := app.Client().Get(app.URL)
	if err != nil {
		t.Fatal("upstream app was stopped")
	}
	_ = response.Body.Close()
}

// A cleanup-pending guard retries until its record says it is done. Once the
// record is gone, or names another guard, nothing is left that the guard can
// prove is its own, so it exits without recreating the private state root.
func TestCleanupPendingGuardExitsWithoutItsRecord(t *testing.T) {
	for _, change := range []string{"removed", "replaced"} {
		t.Run(change, func(t *testing.T) {
			home := root(t)
			_ = fakeTailnet(t, home)
			app := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "keep-app") }))
			defer app.Close()
			c := options(t, home, app.URL, "1m")
			c.Transport = "tailscale"
			v, err := Start(c)
			if err != nil {
				t.Fatal(err)
			}
			record, err := state.Load(home, v.ID)
			if err != nil {
				t.Fatal(err)
			}
			if err = os.Remove(record.ProxyAddress); err != nil {
				t.Fatal(err)
			}
			foreign, err := net.ListenUnix("unix", &net.UnixAddr{Name: record.ProxyAddress, Net: "unix"})
			if err != nil {
				t.Fatal(err)
			}
			foreign.SetUnlinkOnClose(false)
			defer func() { _ = foreign.Close() }()
			if _, err = Stop(home, v.ID); err != nil {
				t.Fatal(err)
			}
			if end := waitEnd(t, home, v.ID); end.State != "cleanup-pending" || !state.Alive(record.Guard) {
				t.Fatal("session did not stay cleanup-pending under its guard")
			}
			if change == "removed" {
				err = os.RemoveAll(home)
			} else {
				self, e := state.Inspect(os.Getpid())
				if e != nil {
					t.Fatal(e)
				}
				err = state.Update(context.Background(), home, v.ID, func(r *state.Record) { r.Guard = self })
			}
			if err != nil {
				t.Fatal(err)
			}
			deadline := time.Now().Add(5 * time.Second)
			for state.Alive(record.Guard) && time.Now().Before(deadline) {
				time.Sleep(25 * time.Millisecond)
			}
			if state.Alive(record.Guard) {
				t.Fatalf("cleanup-pending guard kept running after its record was %s", change)
			}
			if _, err = os.Lstat(home); change == "removed" && !os.IsNotExist(err) {
				t.Fatal("guard recreated the removed state root")
			}
			// The replaced record names this test process; nothing may stop it.
			_ = os.RemoveAll(filepath.Join(home, v.ID))
			response, err := app.Client().Get(app.URL)
			if err != nil {
				t.Fatal("upstream app was stopped")
			}
			_ = response.Body.Close()
		})
	}
}

func TestDaemonProcessFixture(t *testing.T) {
	home := os.Getenv("REMOTE_GUI_TEST_DAEMON_HOME")
	if home == "" {
		return
	}
	_ = fakeTailnet(t, home)
	if err := os.WriteFile(filepath.Join(filepath.Dir(home), "daemon-ready"), []byte("ready"), 0o600); err != nil {
		t.Fatal(err)
	}
	select {}
}

func TestDaemonReplacementRevokesTheSession(t *testing.T) {
	home := root(t)
	parent := filepath.Dir(home)
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	startDaemon := func() (*exec.Cmd, state.Identity) {
		t.Helper()
		_ = os.Remove(filepath.Join(parent, "daemon-ready"))
		_ = os.Remove(filepath.Join(parent, "localapi.sock"))
		child := exec.Command(executable, "-test.run=^TestDaemonProcessFixture$")
		child.Env = append(os.Environ(), "REMOTE_GUI_TEST_DAEMON_HOME="+home)
		if e := child.Start(); e != nil {
			t.Fatal(e)
		}
		identity, e := state.Inspect(child.Process.Pid)
		if e != nil {
			t.Fatal(e)
		}
		t.Cleanup(func() { _ = state.Signal(identity, syscall.SIGKILL); _ = child.Wait() })
		deadline := time.Now().Add(3 * time.Second)
		for time.Now().Before(deadline) {
			if _, e = os.Stat(filepath.Join(parent, "daemon-ready")); e == nil {
				return child, identity
			}
			time.Sleep(10 * time.Millisecond)
		}
		t.Fatal("private fixture daemon did not start")
		return nil, state.Identity{}
	}
	_, old := startDaemon()
	t.Setenv("REMOTE_GUI_TAILSCALE_SOCKET", filepath.Join(parent, "localapi.sock"))
	t.Setenv("SSL_CERT_FILE", filepath.Join(parent, "authority.pem"))
	app := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "preserve-app") }))
	defer app.Close()
	c := options(t, home, app.URL, "1m")
	c.Transport = "tailscale"
	v, err := Start(c)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = Stop(home, v.ID) }()
	record, err := state.Load(home, v.ID)
	if err != nil || record.ServePeer.PID != old.PID {
		t.Fatal("daemon process was not pinned")
	}
	if err = state.Signal(old, syscall.SIGKILL); err != nil {
		t.Fatal(err)
	}
	end := waitEnd(t, home, v.ID)
	if end.State != "cleanup-pending" {
		t.Fatal("lost daemon scope was reported cleaned")
	}
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", record.ProxyAddress)
	}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: time.Second}
	response, err := client.Get("http://localhost/")
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if response.StatusCode == 200 {
		t.Fatal("replaced daemon retained application access")
	}
	_, replacement := startDaemon()
	if replacement.PID == old.PID {
		t.Fatal("fixture did not replace its process")
	}
	if _, err = Cleanup(context.Background(), home); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		record, err = state.Load(home, v.ID)
		if err == nil && record.Forward == nil && record.State == "failed" {
			break
		}
		time.Sleep(25 * time.Millisecond)
	}
	if record.Forward != nil || record.Diagnostic != "tailscale-daemon-identity-changed" {
		t.Fatal("daemon replacement did not reconcile accurately")
	}
	response, err = app.Client().Get(app.URL)
	if err != nil {
		t.Fatal("daemon cleanup stopped upstream")
	}
	_ = response.Body.Close()
}
