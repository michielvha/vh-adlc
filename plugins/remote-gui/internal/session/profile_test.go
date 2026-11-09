package session

import (
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/profile"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

// The supervisor is a re-executed test binary, so the fake browser is selected
// through the inherited environment. It never starts a display or Chromium.
func init() {
	if dir := os.Getenv("REMOTE_GUI_TEST_FAKE_BROWSER"); dir != "" {
		BrowserLauncher = func(ctx context.Context, c config.Config, id string) (BrowserHandle, error) {
			return fakeBrowser(dir, c, id)
		}
	}
}

func lockHeld(c config.Config) string {
	f, err := os.OpenFile(filepath.Join(c.ProfileHome, c.Profile, ".lock"), os.O_RDWR, 0)
	if err != nil {
		return "unavailable"
	}
	defer func() { _ = f.Close() }()
	if err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); errors.Is(err, syscall.EWOULDBLOCK) {
		return "held"
	}
	return "free"
}

func fakeBrowser(dir string, c config.Config, id string) (BrowserHandle, error) {
	if err := os.WriteFile(filepath.Join(dir, "launched-"+id), []byte(c.Mode()), 0o600); err != nil {
		return BrowserHandle{}, err
	}
	if c.Profile != "" {
		// Stand in for browser.Start's retries: the lock must stay held across them.
		first := lockHeld(c)
		time.Sleep(300 * time.Millisecond)
		if err := os.WriteFile(filepath.Join(dir, "lock-"+id), []byte(first+" "+lockHeld(c)), 0o600); err != nil {
			return BrowserHandle{}, err
		}
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return BrowserHandle{}, err
	}
	server := &http.Server{ReadHeaderTimeout: time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			_, _ = io.WriteString(w, "fake viewer")
			return
		}
		conn, buffered, err := http.NewResponseController(w).Hijack()
		if err != nil {
			return
		}
		sum := sha1.Sum([]byte(r.Header.Get("Sec-WebSocket-Key") + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
		_, _ = buffered.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + base64.StdEncoding.EncodeToString(sum[:]) + "\r\n\r\n")
		_ = buffered.Flush()
		_, _ = io.Copy(io.Discard, conn)
		_ = conn.Close()
	})}
	go func() { _ = server.Serve(listener) }()
	return BrowserHandle{
		BrowserMode: c.Mode(),
		Target:      "http://" + listener.Addr().String() + "/vnc.html",
		Assets:      dir,
		Password:    "fixture",
		Alive:       func() bool { return true },
		Stop: func() {
			_ = server.Close()
			_ = os.WriteFile(filepath.Join(dir, "stopped-"+id), nil, 0o600)
		},
	}, nil
}

type profileFixture struct {
	home, profiles, fake string
}

func newProfileFixture(t *testing.T) profileFixture {
	t.Helper()
	home := root(t)
	f := profileFixture{home: home, profiles: filepath.Join(filepath.Dir(home), "profiles"), fake: filepath.Join(filepath.Dir(home), "fake")}
	if err := os.Mkdir(f.fake, 0o700); err != nil {
		t.Fatal(err)
	}
	chromium := filepath.Join(f.fake, "chromium")
	if err := os.WriteFile(chromium, []byte("#!/bin/sh\necho 'Chromium 151.0.7922.137'\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("REMOTE_GUI_TEST_FAKE_BROWSER", f.fake)
	t.Setenv("REMOTE_GUI_CHROMIUM", chromium)
	t.Cleanup(func() {
		ids, _ := state.IDs(home)
		for _, id := range ids {
			_, _ = Stop(home, id)
		}
	})
	return f
}

func (f profileFixture) config(t *testing.T, name string, extra ...string) config.Config {
	t.Helper()
	args := append([]string{"start", "--home", f.home, "--profile-home", f.profiles, "--transport", "loopback", "--ttl", "1m"}, extra...)
	if name != "" {
		args = append(args, "--profile", name)
	}
	c, err := config.Parse(args)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func (f profileFixture) seed(t *testing.T, name string, m profile.Meta) {
	t.Helper()
	held, err := profile.Acquire(f.profiles, name)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Release()
	if err = held.SaveMeta(m); err != nil {
		t.Fatal(err)
	}
}

func (f profileFixture) launched(id string) (string, bool) {
	data, err := os.ReadFile(filepath.Join(f.fake, "launched-"+id))
	return string(data), err == nil
}

func countIDs(t *testing.T, home string) int {
	t.Helper()
	ids, err := state.IDs(home)
	if err != nil {
		t.Fatal(err)
	}
	return len(ids)
}

// guards counts live guard processes for this state root, so a refused start
// can be shown to have spawned nothing.
func guards(home string) int {
	entries, _ := os.ReadDir("/proc")
	count := 0
	for _, entry := range entries {
		if _, err := strconv.Atoi(entry.Name()); err != nil {
			continue
		}
		data, err := os.ReadFile("/proc/" + entry.Name() + "/cmdline")
		if err == nil && strings.Contains(string(data), "\x00_guard\x00"+home+"\x00") {
			if stat, e := os.ReadFile("/proc/" + entry.Name() + "/stat"); e == nil && !strings.Contains(string(stat), ") Z ") {
				count++
			}
		}
	}
	return count
}

func holdsFile(pid int, path string) bool {
	entries, _ := os.ReadDir("/proc/" + strconv.Itoa(pid) + "/fd")
	for _, entry := range entries {
		if target, err := os.Readlink("/proc/" + strconv.Itoa(pid) + "/fd/" + entry.Name()); err == nil && target == path {
			return true
		}
	}
	return false
}

func refused(t *testing.T, f profileFixture, c config.Config, want string) {
	t.Helper()
	before := countIDs(t, f.home)
	_, err := Start(c)
	if err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("expected %s: %v", want, err)
	}
	if countIDs(t, f.home) != before || guards(f.home) != 0 {
		t.Fatalf("refused start (%s) left a record or process", want)
	}
}

func TestProfileStartDefaultsToHumanAndReleasesBeforeStopped(t *testing.T) {
	f := newProfileFixture(t)
	started := time.Now().UTC()
	v, err := Start(f.config(t, "work"))
	if err != nil {
		t.Fatal(err)
	}
	if v.Profile != "work" || v.BrowserMode != "human" {
		t.Fatalf("profile view: %+v", v)
	}
	if mode, ok := f.launched(v.ID); !ok || mode != "human" {
		t.Fatalf("profile session did not launch in human mode: %q", mode)
	}
	data, err := os.ReadFile(filepath.Join(f.fake, "lock-"+v.ID))
	if err != nil || string(data) != "held held" {
		t.Fatalf("lock not held across the start retry: %q %v", data, err)
	}
	r, err := state.Load(f.home, v.ID)
	if err != nil {
		t.Fatal(err)
	}
	lock := filepath.Join(f.profiles, "work", ".lock")
	if !holdsFile(r.Guard.PID, lock) || holdsFile(r.Supervisor.PID, lock) || holdsFile(os.Getpid(), lock) {
		t.Fatal("the guard alone must hold the profile lock")
	}
	m, err := profile.ReadMeta(f.profiles, "work")
	if err != nil || m.HolderID != v.ID || m.HolderGuard == nil || !state.Equal(*m.HolderGuard, r.Guard) || m.Transport != "loopback" || m.OwnerLogin != "" || m.ChromiumMajor != 151 {
		t.Fatalf("holder bookkeeping: %+v %v", m, err)
	}
	if read, e := Read(f.home, v.ID); e != nil || read.Profile != "work" {
		t.Fatalf("status lacks profile: %+v %v", read, e)
	}
	if access, e := Access(f.home, v.ID, false); e != nil || access.Profile != "work" {
		t.Fatalf("access lacks profile: %+v %v", access, e)
	}
	end, err := Stop(f.home, v.ID)
	if err != nil || end.State != "stopped" {
		t.Fatalf("stop: %+v %v", end, err)
	}
	held, err := profile.Acquire(f.profiles, "work")
	if err != nil {
		t.Fatalf("lock still held when stop reported stopped: %v", err)
	}
	m, _, err = held.Meta()
	held.Release()
	if err != nil || m.HolderID != "" || m.HolderGuard != nil || !m.LastUsed.After(started) {
		t.Fatalf("holder not cleared before stopped: %+v %v", m, err)
	}
	next, err := Start(f.config(t, "work"))
	if err != nil {
		t.Fatalf("start right after stop: %v", err)
	}
	if _, err = Stop(f.home, next.ID); err != nil {
		t.Fatal(err)
	}
}

func TestProfileAgentStartNeedsApproval(t *testing.T) {
	f := newProfileFixture(t)
	if _, err := config.Parse([]string{"start", "--home", f.home, "--profile-home", f.profiles, "--transport", "loopback", "--profile", "work", "--browser-mode", "agent"}); err == nil || !strings.Contains(err.Error(), "profile-requires-human-start") {
		t.Fatalf("unapproved agent start accepted: %v", err)
	}
	v, err := Start(f.config(t, "work", "--browser-mode", "agent", "--agent-start-approved"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = Stop(f.home, v.ID) }()
	if mode, _ := f.launched(v.ID); mode != "agent" {
		t.Fatalf("approved start did not run in agent mode: %q", mode)
	}
	raw, err := os.ReadFile(filepath.Join(f.home, v.ID, "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	var record struct {
		Config map[string]any `json:"config"`
	}
	if err = json.Unmarshal(raw, &record); err != nil || record.Config["agent_start_approved"] != true || record.Config["profile"] != "work" {
		t.Fatalf("record lacks approval: %s", raw)
	}
	m, err := profile.ReadMeta(f.profiles, "work")
	if err != nil || strings.Contains(fmt.Sprintf("%+v", m), "approved") {
		t.Fatal("approval leaked into the profile")
	}
}

func TestStartWithoutProfileKeepsRecordsAndOutput(t *testing.T) {
	f := newProfileFixture(t)
	v, err := Start(f.config(t, ""))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = Stop(f.home, v.ID) }()
	raw, err := os.ReadFile(filepath.Join(f.home, v.ID, "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	var record map[string]json.RawMessage
	if err = json.Unmarshal(raw, &record); err != nil {
		t.Fatal(err)
	}
	var cfg map[string]any
	if err = json.Unmarshal(record["config"], &cfg); err != nil {
		t.Fatal(err)
	}
	var keys []string
	for key := range cfg {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	if !slices.Equal(keys, []string{"browser_mode", "command", "home", "kind", "transport", "ttl"}) || cfg["browser_mode"] != "agent" {
		t.Fatalf("record config changed without --profile: %v", cfg)
	}
	if _, ok := record["profile_recovery"]; ok {
		t.Fatal("record gained a profile field")
	}
	for _, check := range []func() (View, error){
		func() (View, error) { return v, nil },
		func() (View, error) { return Read(f.home, v.ID) },
		func() (View, error) { return Access(f.home, v.ID, false) },
		func() (View, error) { return Stop(f.home, v.ID) },
	} {
		view, e := check()
		data, _ := json.Marshal(view)
		if e != nil || strings.Contains(string(data), "profile") {
			t.Fatalf("output without --profile changed: %s %v", data, e)
		}
	}
	if entries, _ := os.ReadDir(filepath.Dir(f.home)); slices.ContainsFunc(entries, func(e os.DirEntry) bool { return e.Name() == "profiles" }) {
		t.Fatal("a session without --profile created a profile store")
	}
}

// fakeOwnerAPI answers only LocalAPI status; each call returns the next login.
func fakeOwnerAPI(t *testing.T, dir string, logins ...string) *atomic.Int32 {
	t.Helper()
	socket := filepath.Join(dir, "owner-api.sock")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int32
	server := &http.Server{ReadHeaderTimeout: time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/localapi/v0/status" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		n := int(calls.Add(1)) - 1
		login := logins[min(n, len(logins)-1)]
		_, _ = fmt.Fprintf(w, `{"BackendState":"Running","Self":{"DNSName":"127.0.0.1","UserID":7},"User":{"7":{"LoginName":%q}}}`, login)
	})}
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(func() { _ = server.Close() })
	t.Setenv("REMOTE_GUI_TAILSCALE_SOCKET", socket)
	return &calls
}

func TestProfileOwnerAndTransportBinding(t *testing.T) {
	f := newProfileFixture(t)
	calls := fakeOwnerAPI(t, f.fake, "owner@example.test")
	f.seed(t, "theirs", profile.Meta{OwnerLogin: "other@example.test", Transport: "tailscale"})
	held, err := profile.Acquire(f.profiles, "theirs")
	if err != nil {
		t.Fatal(err)
	}
	// The resolved owner is compared before the lock, so a held profile of
	// another owner reports the mismatch, not who holds it.
	refused(t, f, f.config(t, "theirs", "--transport", "tailscale"), "profile-owner-mismatch")
	held.Release()
	if calls.Load() == 0 {
		t.Fatal("owner was not resolved through the LocalAPI")
	}
	refused(t, f, f.config(t, "theirs", "--transport", "tailscale"), "profile-owner-mismatch")
	f.seed(t, "local", profile.Meta{Transport: "loopback"})
	refused(t, f, f.config(t, "local", "--transport", "tailscale"), "profile-owner-mismatch")
	f.seed(t, "remote", profile.Meta{OwnerLogin: "owner@example.test", Transport: "tailscale"})
	refused(t, f, f.config(t, "remote"), "profile-owner-mismatch")
	for _, name := range []string{"theirs", "local", "remote"} {
		if m, err := profile.ReadMeta(f.profiles, name); err != nil || m.HolderID != "" {
			t.Fatalf("refused start changed %s: %+v %v", name, m, err)
		}
	}
}

func TestSupervisorRechecksOwnerBeforeChromium(t *testing.T) {
	f := newProfileFixture(t)
	fakeOwnerAPI(t, f.fake, "owner@example.test", "other@example.test")
	_, err := Start(f.config(t, "work", "--transport", "tailscale"))
	if err == nil || !strings.Contains(err.Error(), "profile-owner-mismatch") {
		t.Fatalf("supervisor accepted a changed owner: %v", err)
	}
	ids, _ := state.IDs(f.home)
	if len(ids) != 1 {
		t.Fatal("expected the one failed record")
	}
	if _, launched := f.launched(ids[0]); launched {
		t.Fatal("Chromium launched before the supervisor matched the profile owner")
	}
	waitEnd(t, f.home, ids[0])
	deadline := time.Now().Add(5 * time.Second)
	for {
		held, e := profile.Acquire(f.profiles, "work")
		if e == nil {
			held.Release()
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("failed session kept the profile lock")
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func deadGuard(t *testing.T) state.Identity {
	t.Helper()
	cmd := exec.Command("sleep", "30")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	identity, err := state.Inspect(cmd.Process.Pid)
	if err != nil {
		t.Fatal(err)
	}
	_ = cmd.Process.Kill()
	_ = cmd.Wait()
	return identity
}

func TestConcurrentProfileStarts(t *testing.T) {
	f := newProfileFixture(t)
	finished := strings.Repeat("f", 32)
	dead := deadGuard(t)
	f.seed(t, "work", profile.Meta{Transport: "loopback", HolderID: finished, HolderGuard: &dead})
	listing := make(chan struct{})
	var listErr atomic.Value
	go func() {
		for {
			select {
			case <-listing:
				return
			default:
			}
			if _, err := profile.List(f.profiles); err != nil {
				listErr.Store(err)
			}
		}
	}()
	var views [2]View
	var errs [2]error
	var wg sync.WaitGroup
	for i := range 2 {
		wg.Go(func() { views[i], errs[i] = Start(f.config(t, "work")) })
	}
	wg.Wait()
	close(listing)
	if listErr.Load() != nil {
		t.Fatal(listErr.Load())
	}
	winner, loser := 0, 1
	if errs[0] != nil {
		winner, loser = 1, 0
	}
	if errs[winner] != nil || errs[loser] == nil {
		t.Fatalf("want one success and one refusal: %v / %v", errs[0], errs[1])
	}
	var inUse *profile.InUseError
	if !errors.As(errs[loser], &inUse) || (inUse.Holder != "starting" && inUse.Holder != views[winner].ID) || strings.Contains(errs[loser].Error(), finished) {
		t.Fatalf("loser report: %v", errs[loser])
	}
	if countIDs(t, f.home) != 1 || guards(f.home) != 1 {
		t.Fatal("the losing start left a record or process")
	}
	r, err := state.Load(f.home, views[winner].ID)
	if err != nil || !strings.Contains(r.ProfileRecovery, finished) {
		t.Fatalf("dead holder recovery not noted: %q %v", r.ProfileRecovery, err)
	}
	_, err = Start(f.config(t, "work"))
	if !errors.As(err, &inUse) || inUse.Holder != views[winner].ID {
		t.Fatalf("live holder not named: %v", err)
	}
}

func TestProfileStartRefusesRunningBrowserAndNewerChromium(t *testing.T) {
	f := newProfileFixture(t)
	f.seed(t, "newer", profile.Meta{Transport: "loopback", ChromiumMajor: 999})
	refused(t, f, f.config(t, "newer"), "profile-chromium-newer")

	f.seed(t, "busy", profile.Meta{Transport: "loopback"})
	browser := exec.Command("sleep", "30")
	if err := browser.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = browser.Process.Kill(); _ = browser.Wait() }()
	identity, err := state.Inspect(browser.Process.Pid)
	if err != nil {
		t.Fatal(err)
	}
	socketDir, err := os.MkdirTemp("/tmp", "rg-singleton-")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = os.RemoveAll(socketDir) }()
	listener, err := net.Listen("unix", filepath.Join(socketDir, "SingletonSocket"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = listener.Close() }()
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			_ = conn.Close()
		}
	}()
	chromium := filepath.Join(f.profiles, "busy", "chromium")
	host, _ := os.Hostname()
	for name, target := range map[string]string{"SingletonLock": host + "-" + strconv.Itoa(identity.PID), "SingletonCookie": "1", "SingletonSocket": filepath.Join(socketDir, "SingletonSocket")} {
		if err = os.Symlink(target, filepath.Join(chromium, name)); err != nil {
			t.Fatal(err)
		}
	}
	refused(t, f, f.config(t, "busy"), "close the browser")
	orphan, err := state.New(f.home)
	if err != nil {
		t.Fatal(err)
	}
	if err = state.Save(f.home, state.Record{Version: 1, ID: orphan, Kind: "browser", State: "ready", Config: f.config(t, "busy"), Guard: deadGuard(t), Supervisor: deadGuard(t), Owned: []state.Process{{Role: "browser", Identity: identity}}}); err != nil {
		t.Fatal(err)
	}
	_, err = Start(f.config(t, "busy"))
	if err == nil || !strings.Contains(err.Error(), "profile-browser-still-running") || !strings.Contains(err.Error(), orphan) || !strings.Contains(err.Error(), "cleanup") {
		t.Fatalf("diagnostic does not name the owning session and its recovery: %v", err)
	}
	if countIDs(t, f.home) != 1 || guards(f.home) != 0 {
		t.Fatal("refused start left a record or process")
	}
	for _, name := range []string{"SingletonLock", "SingletonCookie", "SingletonSocket"} {
		if _, err = os.Lstat(filepath.Join(chromium, name)); err != nil {
			t.Fatal("a live browser's singleton files were removed")
		}
	}
	if !state.Alive(identity) {
		t.Fatal("refused start disturbed the browser")
	}
}

func TestProfileListAndDelete(t *testing.T) {
	f := newProfileFixture(t)
	v, err := Start(f.config(t, "work"))
	if err != nil {
		t.Fatal(err)
	}
	listed, err := ProfileList(f.profiles)
	if err != nil || len(listed) != 1 || !listed[0].InUse || listed[0].Holder != v.ID || listed[0].Transport != "loopback" {
		t.Fatalf("in-use listing: %+v %v", listed, err)
	}
	if _, err = ProfileDelete(f.home, f.profiles, "work"); err == nil || !strings.Contains(err.Error(), "profile-in-use") {
		t.Fatalf("deleted a profile in use: %v", err)
	}
	if _, err = Stop(f.home, v.ID); err != nil {
		t.Fatal(err)
	}
	listed, err = ProfileList(f.profiles)
	if err != nil || len(listed) != 1 || listed[0].InUse || listed[0].LastUsed.IsZero() || listed[0].Created.IsZero() {
		t.Fatalf("idle listing: %+v %v", listed, err)
	}
	deleted, err := ProfileDelete(f.home, f.profiles, "work")
	if err != nil || deleted.Result != "deleted" {
		t.Fatalf("delete: %+v %v", deleted, err)
	}
	if _, err = os.Lstat(filepath.Join(f.profiles, "work")); !os.IsNotExist(err) {
		t.Fatal("deleted profile directory remains")
	}
	again, err := ProfileDelete(f.home, f.profiles, "work")
	if err != nil || again.Result != "missing" {
		t.Fatalf("repeated delete: %+v %v", again, err)
	}
}
