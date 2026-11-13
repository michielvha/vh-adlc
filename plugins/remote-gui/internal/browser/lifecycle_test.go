package browser

import (
	"bufio"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/session"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

func TestFailedHandoffRetainsRecoveryAfterOwnerClosesBrowser(t *testing.T) {
	c, id := setup(t)
	command := exec.Command("sleep", "30")
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { _ = command.Wait(); close(done) }()
	defer func() { _ = command.Process.Kill(); <-done }()
	identity, err := state.Inspect(command.Process.Pid)
	if err != nil {
		t.Fatal(err)
	}
	chrome := &child{role: "browser", identity: identity, done: done}
	r := &runtime{home: c.Home, id: id, chrome: chrome, children: []*child{chrome}, modeReady: true}
	r.current.BrowserMode = "human"
	if err := state.Update(context.Background(), c.Home, id, func(record *state.Record) {
		record.Owned = []state.Process{{Role: "browser", Identity: identity}}
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := r.handoff(context.Background(), "agent"); err == nil {
		t.Fatal("missing owned display reported a completed handoff")
	}
	if err := command.Process.Kill(); err != nil {
		t.Fatal(err)
	}
	<-done
	if !r.healthy() {
		t.Fatal("owner completing a failed close would trigger premature profile cleanup")
	}
}

// privateSession reruns the calling test as a session leader, the way the guard
// runs the supervisor that owns a browser, and reports whether the caller is
// already that rerun and should continue.
func privateSession(t *testing.T) bool {
	t.Helper()
	if self, err := state.Inspect(os.Getpid()); err == nil && self.Session == self.PID {
		return true
	}
	cmd := exec.Command(os.Args[0], "-test.run=^"+t.Name()+"$", "-test.count=1", "-test.v")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	out, err := cmd.CombinedOutput()
	if err != nil || !strings.Contains(string(out), "--- PASS: "+t.Name()) {
		t.Fatalf("private-session run failed: %v\n%s", err, out)
	}
	return false
}

// Chromium's network service flushes its disk cache into the profile after the
// browser process has exited. These scripts stand in for such helpers.
const (
	// Writes once the browser is gone, then exits on its own.
	flushingHelper = `while kill -0 "$parent" 2>/dev/null; do sleep 0.02; done; sleep 0.3; mkdir -p "$profile/Default/Cache"; : >"$profile/Default/Cache/index"; : >"$marker"`
	// Ignores the browser's exit until it is killed.
	stubbornHelper = `trap '' TERM; mkdir -p "$profile/Default/Cache"; : >"$marker"; while :; do mkdir -p "$profile/Default/Cache"; sleep 0.02; done`
	// Keeps forking writers until it is killed.
	forkingHelper = `trap '' TERM; while :; do (sleep 0.2; mkdir -p "$profile/Default/Cache"; : >"$marker") & sleep 0.01; done`
)

func TestStopOutlastsBrowserHelpers(t *testing.T) {
	if !privateSession(t) {
		return
	}
	t.Run("flushing", func(t *testing.T) { stopOutlastsHelper(t, flushingHelper, "", false) })
	t.Run("stubborn", func(t *testing.T) { stopOutlastsHelper(t, stubbornHelper, "", false) })
	t.Run("late-fork", func(t *testing.T) { stopOutlastsHelper(t, forkingHelper, "", false) })
	// A browser that crashed or was closed by its owner leaves helpers that are
	// no longer its descendants, and a helper may lead its own process group.
	t.Run("orphaned", func(t *testing.T) { stopOutlastsHelper(t, stubbornHelper, "", true) })
	t.Run("own-process-group", func(t *testing.T) { stopOutlastsHelper(t, stubbornHelper, "set -m; ", true) })
}

func stopOutlastsHelper(t *testing.T, helperScript, prefix string, orphan bool) {
	t.Helper()
	c, id := setup(t)
	profile := filepath.Join(c.Home, id, "profile")
	if err := os.Mkdir(profile, 0o700); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	marker, pidFile := filepath.Join(dir, "helper-wrote"), filepath.Join(dir, "helper-pid")
	script := `profile=$1 marker=$2; parent=$$; ` + prefix + `(sh -c 'echo $PPID' >"$3"; ` + helperScript + `) & exec sleep 30`
	r := &runtime{home: c.Home, id: id, profile: profile}
	browser, err := r.spawn("browser", "/bin/bash", []string{"-c", script, "bash", profile, marker, pidFile}, nil)
	if err != nil {
		t.Fatal(err)
	}
	var helper state.Identity
	for deadline := time.Now().Add(5 * time.Second); helper.PID == 0; time.Sleep(10 * time.Millisecond) {
		if time.Now().After(deadline) {
			t.Fatal("helper did not start")
		}
		data, _ := os.ReadFile(pidFile)
		if pid, e := strconv.Atoi(strings.TrimSpace(string(data))); e == nil {
			helper, _ = state.Inspect(pid)
		}
	}
	t.Cleanup(func() { _ = state.Signal(helper, syscall.SIGKILL) })
	if prefix != "" && helper.Group == browser.identity.Group {
		t.Fatal("helper did not lead its own process group")
	}
	if orphan {
		if err = state.Signal(browser.identity, syscall.SIGKILL); err != nil {
			t.Fatal(err)
		}
		<-browser.done
	}
	r.stop()
	if r.cleanupErr != nil {
		t.Fatal(r.cleanupErr)
	}
	if state.Alive(helper) {
		t.Fatal("browser helper survived stop")
	}
	if _, err := os.Stat(marker); err != nil {
		t.Fatal("helper never wrote the profile")
	}
	time.Sleep(500 * time.Millisecond)
	if _, err := os.Stat(profile); !os.IsNotExist(err) {
		t.Fatal("browser helper recreated the profile after stop")
	}
}

// A recorded guard whose PID now belongs to a foreign session leader must not
// make that session's processes look like ours.
func TestStopLeavesForeignSessionsAlone(t *testing.T) {
	if !privateSession(t) {
		return
	}
	foreign := exec.Command("/bin/sh", "-c", "/bin/sleep 30 & wait")
	foreign.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := foreign.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = foreign.Process.Kill(); _ = foreign.Wait() })
	leader, err := state.Inspect(foreign.Process.Pid)
	if err != nil {
		t.Fatal(err)
	}
	c, id := setup(t)
	stale := leader
	stale.Start = "recycled"
	if err = state.Update(context.Background(), c.Home, id, func(record *state.Record) { record.Guard = stale }); err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)
	var members []state.Identity
	entries, _ := os.ReadDir("/proc")
	for _, e := range entries {
		if pid, e := strconv.Atoi(e.Name()); e == nil {
			if member, e := state.Inspect(pid); e == nil && member.Session == leader.PID {
				members = append(members, member)
			}
		}
	}
	if len(members) < 2 {
		t.Fatal("foreign session did not start")
	}
	(&runtime{home: c.Home, id: id}).stop()
	for _, member := range members {
		if !state.Alive(member) {
			t.Fatal("stop signalled a process outside its session")
		}
	}
}

func TestHandoffRetainsLockedProfile(t *testing.T) {
	c, id := setup(t)
	profile := filepath.Join(c.Home, id, "profile")
	if err := os.Mkdir(profile, 0o700); err != nil {
		t.Fatal(err)
	}
	lock := filepath.Join(profile, "SingletonLock")
	if err := os.WriteFile(lock, []byte("owned-lock-sentinel"), 0o600); err != nil {
		t.Fatal(err)
	}
	r := &runtime{home: c.Home, id: id, profile: profile}
	r.current.BrowserMode = "human"
	if _, err := r.handoff(context.Background(), "agent"); err == nil || !strings.Contains(err.Error(), "profile-still-locked") {
		t.Fatalf("locked profile accepted: %v", err)
	}
	data, err := os.ReadFile(lock)
	if err != nil || string(data) != "owned-lock-sentinel" || len(r.children) != 0 {
		t.Fatal("profile lock modified or duplicate browser started")
	}
}

func TestFailedMarkerFocusRetainsPrivateControlForRetry(t *testing.T) {
	c, id := setup(t)
	command := exec.Command("sleep", "30")
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { _ = command.Wait(); close(done) }()
	defer func() { _ = command.Process.Kill(); <-done }()
	identity, err := state.Inspect(command.Process.Pid)
	if err != nil {
		t.Fatal(err)
	}
	chrome := &child{role: "browser", identity: identity, done: done}
	r := &runtime{home: c.Home, id: id, chrome: chrome, children: []*child{chrome}, modeReady: true}
	r.current.BrowserMode, r.current.CDPAddress = "agent", "http://127.0.0.1:1"
	if err = state.Update(context.Background(), c.Home, id, func(record *state.Record) {
		record.Owned = []state.Process{{Role: "browser", Identity: identity}}
	}); err != nil {
		t.Fatal(err)
	}
	if _, err = r.handoff(context.Background(), "human"); err == nil {
		t.Fatal("unverified marker focus reported successful handoff")
	}
	if r.current.CDPAddress == "" || !state.Alive(identity) || !r.healthy() {
		t.Fatal("failed marker focus lost the owned browser's retry state")
	}
}

func TestHandoffRejectsForeignBrowserIdentity(t *testing.T) {
	c, id := setup(t)
	self, err := state.Inspect(os.Getpid())
	if err != nil {
		t.Fatal(err)
	}
	r := &runtime{home: c.Home, id: id, chrome: &child{role: "browser", identity: self}}
	r.current.BrowserMode = "human"
	if _, err := r.handoff(context.Background(), "agent"); err == nil || !strings.Contains(err.Error(), "ownership-changed") {
		t.Fatalf("foreign process accepted: %v", err)
	}
	if !state.Alive(self) {
		t.Fatal("unowned process was disturbed")
	}
}

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

type clipboardDouble struct {
	mu        sync.Mutex
	failClear int
	clears    int
	sets      []string
	onClear   func()
}

func (d *clipboardDouble) Set(_ context.Context, text string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.sets = append(d.sets, text)
	return nil
}

func (d *clipboardDouble) Get(context.Context) (string, error)            { return "", nil }
func (d *clipboardDouble) Close() error                                   { return nil }
func (d *clipboardDouble) Menus(context.Context) (map[uint32]bool, error) { return nil, nil }

func (d *clipboardDouble) Clear(context.Context) error {
	d.mu.Lock()
	d.clears++
	hook, fail := d.onClear, d.failClear > 0
	if fail {
		d.failClear--
	}
	d.mu.Unlock()
	if hook != nil {
		hook()
	}
	if fail {
		return errors.New("clipboard-clear-unverified")
	}
	return nil
}

func (d *clipboardDouble) counts() (int, int) {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.clears, len(d.sets)
}

func TestFailedClipboardClearBlocksAgentLaunch(t *testing.T) {
	c, id := setup(t)
	// Any launch attempt fails at once and names itself.
	t.Setenv("REMOTE_GUI_CHROMIUM", filepath.Join(t.TempDir(), "absent-chromium"))
	profile := filepath.Join(c.Home, id, "profile")
	if err := os.Mkdir(profile, 0o700); err != nil {
		t.Fatal(err)
	}
	double := &clipboardDouble{failClear: 1}
	r := &runtime{home: c.Home, id: id, profile: profile, clip: double, clipMode: "human"}
	r.current.BrowserMode = "human"
	ctx := context.Background()
	var racing error
	var marked bool
	double.onClear = func() {
		r.clipMu.Lock()
		marked = r.clipSwitching
		r.clipMu.Unlock()
		_, racing = r.clipboard().Set(ctx, "racing-send", "human")
	}
	if _, err := r.handoff(ctx, "agent"); err == nil || err.Error() != "clipboard-clear-unverified" {
		t.Fatalf("failed clear: %v", err)
	}
	if clears, sets := double.counts(); clears != 1 || sets != 0 || len(r.children) != 0 {
		t.Fatalf("failed clear reached launch: clears=%d sets=%d children=%d", clears, sets, len(r.children))
	}
	if !marked || racing == nil || racing.Error() != "clipboard-busy" {
		t.Fatalf("send during the switch: marked=%v %v", marked, racing)
	}
	r.clipMu.Lock()
	switching, mode := r.clipSwitching, r.clipMode
	r.clipMu.Unlock()
	if switching || mode != "human" {
		t.Fatalf("failed handoff left switching=%v mode=%q", switching, mode)
	}
	double.onClear = nil
	_, err := r.handoff(ctx, "agent")
	if err == nil || err.Error() != "browser-start-failed" {
		t.Fatalf("retry did not reach the launch: %v", err)
	}
	if clears, _ := double.counts(); clears != 2 {
		t.Fatalf("retry did not clear again before launch: clears=%d", clears)
	}
	r.clipMu.Lock()
	switching = r.clipSwitching
	r.clipMu.Unlock()
	if switching {
		t.Fatal("failed launch left the switch marked")
	}
}

func TestClipboardSetRefusedDuringSwitchOrModeChange(t *testing.T) {
	double := &clipboardDouble{}
	r := &runtime{clip: double, clipMode: "human"}
	ctx := context.Background()
	r.clipSwitching = true
	if _, err := r.clipboard().Set(ctx, "during-switch", "human"); err == nil || err.Error() != "clipboard-busy" {
		t.Fatalf("send during switch: %v", err)
	}
	r.clipSwitching = false
	if _, err := r.clipboard().Set(ctx, "stale-mode", "agent"); err == nil || err.Error() != "clipboard-busy" {
		t.Fatalf("send for another mode: %v", err)
	}
	mode, err := r.clipboard().Set(ctx, "accepted", "human")
	if err != nil || mode != "human" {
		t.Fatalf("matching send: %q %v", mode, err)
	}
	if double.sets == nil || len(double.sets) != 1 || double.sets[0] != "accepted" {
		t.Fatal("refused sends reached the helper")
	}
}

func TestEveryHandoffExitClearsTheSwitchMark(t *testing.T) {
	c, id := setup(t)
	profile := filepath.Join(c.Home, id, "profile")
	if err := os.Mkdir(profile, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(profile, "SingletonLock"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	double := &clipboardDouble{}
	r := &runtime{home: c.Home, id: id, profile: profile, clip: double, clipMode: "human"}
	r.current.BrowserMode = "human"
	if _, err := r.handoff(context.Background(), "agent"); err == nil {
		t.Fatal("locked profile accepted")
	}
	r.clipMu.Lock()
	switching := r.clipSwitching
	r.clipMu.Unlock()
	if switching {
		t.Fatal("locked-profile exit left the switch marked")
	}
	if clears, _ := double.counts(); clears != 0 {
		t.Fatal("clear ran although the old browser profile stayed locked")
	}
}
