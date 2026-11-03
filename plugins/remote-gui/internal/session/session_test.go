package session

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

func TestMain(m *testing.M) {
	if handled, code := Internal(os.Args[1:]); handled {
		os.Exit(code)
	}
	os.Exit(m.Run())
}

func root(t *testing.T) string {
	t.Helper()
	p, err := os.MkdirTemp("/tmp", "rg-session-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(p) })
	return filepath.Join(p, "state")
}

func options(t *testing.T, home, target, ttl string) config.Config {
	t.Helper()
	c, err := config.Parse([]string{"share", target, "--home", home, "--transport", "loopback", "--ttl", ttl})
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func waitEnd(t *testing.T, home, id string) View {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		v, err := Read(home, id)
		if err == nil && (v.State == "stopped" || v.State == "failed" || v.State == "cleanup-pending") {
			return v
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("session cleanup did not finish")
	return View{}
}

func auth(t *testing.T, v View, code string) *http.Cookie {
	t.Helper()
	u, err := url.Parse(v.URL)
	if err != nil {
		t.Fatal(err)
	}
	origin := u.Scheme + "://" + u.Host
	req, _ := http.NewRequest(http.MethodPost, origin+"/__remote_gui/login", strings.NewReader(url.Values{"code": {code}}.Encode()))
	req.Header.Set("Origin", origin)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	c := &http.Client{Timeout: time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	r, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = r.Body.Close() }()
	if r.StatusCode != 303 || len(r.Cookies()) != 1 {
		t.Fatal("session enrollment failed")
	}
	return r.Cookies()[0]
}

func TestServiceLifecycleAndRedaction(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "owned-app") }))
	defer upstream.Close()
	home := root(t)
	v, err := Start(options(t, home, upstream.URL+"/app?private=query-sentinel", "1m"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = Stop(home, v.ID) })
	if v.State != "ready" {
		t.Fatal("share transport not ready")
	}
	raw, _ := json.Marshal(v)
	if strings.Contains(string(raw), "query-sentinel") {
		t.Fatal("status exported private query")
	}
	a, err := Access(home, v.ID, true)
	if err != nil || a.AccessCode == "" {
		t.Fatal("explicit access code unavailable")
	}
	cookie := auth(t, a, a.AccessCode)
	req, _ := http.NewRequest(http.MethodGet, a.URL, nil)
	req.AddCookie(cookie)
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(r.Body)
	_ = r.Body.Close()
	if string(body) != "owned-app" {
		t.Fatal("wrong app forwarded")
	}
	if _, err = Stop(home, v.ID); err != nil {
		t.Fatal(err)
	}
	ended := waitEnd(t, home, v.ID)
	if ended.State != "stopped" {
		t.Fatalf("stop state %s", ended.State)
	}
	r, err = http.Get(upstream.URL)
	if err != nil {
		t.Fatal("share stop killed upstream")
	}
	_ = r.Body.Close()
	if _, err = Stop(home, v.ID); err != nil {
		t.Fatal("repeated stop failed")
	}
	if st, e := Access(home, v.ID, true); e == nil && st.AccessCode != "" {
		t.Fatal("stopped session revealed access")
	}
}

func TestConcurrentSharesAndSupervisorCrash(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "app") }))
	defer upstream.Close()
	home := root(t)
	var a, b View
	var ea, eb error
	var wg sync.WaitGroup
	wg.Go(func() { a, ea = Start(options(t, home, upstream.URL, "1m")) })
	wg.Go(func() { b, eb = Start(options(t, home, upstream.URL, "1m")) })
	wg.Wait()
	if ea != nil || eb != nil {
		t.Fatalf("concurrent start %v %v", ea, eb)
	}
	t.Cleanup(func() { _, _ = Stop(home, a.ID); _, _ = Stop(home, b.ID) })
	if a.ID == b.ID || a.URL == b.URL {
		t.Fatal("concurrent resource collision")
	}
	rec, err := state.Load(home, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = state.Signal(rec.Supervisor, syscall.SIGKILL); err != nil {
		t.Fatal(err)
	}
	waitEnd(t, home, a.ID)
	alive, err := Read(home, b.ID)
	if err != nil || alive.State != "ready" {
		t.Fatal("one crash stopped another session")
	}
	if _, err = Stop(home, b.ID); err != nil {
		t.Fatal(err)
	}
	waitEnd(t, home, b.ID)
}

func TestExpiryAndReusedListener(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer upstream.Close()
	home := root(t)
	v, err := Start(options(t, home, upstream.URL, "3s"))
	if err != nil {
		t.Fatal(err)
	}
	ended := waitEnd(t, home, v.ID)
	if ended.State != "stopped" {
		t.Fatal("expiry failed cleanup")
	}
	old := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	address := old.Listener.Addr().String()
	v, err = Start(options(t, home, old.URL, "1m"))
	if err != nil {
		old.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = Stop(home, v.ID) })
	old.Close()
	listener, err := net.Listen("tcp", address)
	if err != nil {
		t.Fatal(err)
	}
	replacement := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "replacement") }))
	_ = replacement.Listener.Close()
	replacement.Listener = listener
	replacement.Start()
	defer replacement.Close()
	waitEnd(t, home, v.ID)
	r, err := http.Get(replacement.URL)
	if err != nil {
		t.Fatal("replacement service was stopped")
	}
	_ = r.Body.Close()
}

func TestRejectBrowserControlTargetAndInvalidRecord(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/json/version" {
			_, _ = io.WriteString(w, `{"webSocketDebuggerUrl":"ws://127.0.0.1/control"}`)
			return
		}
		w.WriteHeader(200)
	}))
	defer upstream.Close()
	home := root(t)
	if _, err := Start(options(t, home, upstream.URL, "1m")); err == nil {
		t.Fatal("browser debugging service was shared")
	}
	if _, err := Cleanup(context.Background(), home); err != nil {
		t.Fatal(err)
	}
}

func TestPreviousBootCleanupPreservesReusedProcess(t *testing.T) {
	home := root(t)
	id, err := state.New(home)
	if err != nil {
		t.Fatal(err)
	}
	mine, err := state.Inspect(os.Getpid())
	if err != nil {
		t.Fatal(err)
	}
	old := mine
	old.Boot = "a-previous-boot"
	rec := state.Record{Version: 1, ID: id, Kind: "share", State: "stopping", Guard: old, Supervisor: old, Owned: []state.Process{{Role: "previous-boot-child", Identity: old}}}
	if err = state.Save(home, rec); err != nil {
		t.Fatal(err)
	}
	v, err := Cleanup(context.Background(), home)
	if err != nil || len(v) != 1 || v[0].State != "stopped" {
		t.Fatalf("previous boot did not reconcile: %v %v", v, err)
	}
	if !state.Alive(mine) {
		t.Fatal("reused process was touched")
	}
}

func TestLifetimeGuardCrashRevokesAndRecovers(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer upstream.Close()
	home := root(t)
	v, err := Start(options(t, home, upstream.URL, "1m"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = Cleanup(context.Background(), home) })
	r, err := state.Load(home, v.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = state.Signal(r.Guard, syscall.SIGKILL); err != nil {
		t.Fatal(err)
	}
	waitEnd(t, home, v.ID)
	_, err = Cleanup(context.Background(), home)
	if err != nil {
		t.Fatal(err)
	}
	r, err = state.Load(home, v.ID)
	if err != nil || (r.State != "stopped" && r.State != "failed") {
		t.Fatal("guard crash did not reconcile")
	}
}

func TestCleanupDoesNotFollowProfileSymlink(t *testing.T) {
	home := root(t)
	id, err := state.New(home)
	if err != nil {
		t.Fatal(err)
	}
	foreign := t.TempDir()
	sentinel := filepath.Join(foreign, "keep")
	if err = os.WriteFile(sentinel, []byte("preserve"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err = os.Symlink(foreign, filepath.Join(home, id, "profile")); err != nil {
		t.Fatal(err)
	}
	if err = state.Save(home, state.Record{Version: 1, ID: id, Kind: "share", State: "starting"}); err != nil {
		t.Fatal(err)
	}
	if _, err = Cleanup(context.Background(), home); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(sentinel); err != nil {
		t.Fatal("cleanup followed a profile symlink")
	}
}
