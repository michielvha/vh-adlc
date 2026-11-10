package browser

import (
	"bufio"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/profile"
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
	// Helper roles re-execute this test binary in place of x11vnc and Chromium.
	if file := os.Getenv("REMOTE_GUI_TEST_FAKE_VNC"); file != "" {
		os.Exit(fakeVNC(file))
	}
	if file := os.Getenv("REMOTE_GUI_TEST_STUBBORN"); file != "" {
		os.Exit(stubbornBrowser(file))
	}
	session.BrowserLauncher = Start
	if os.Getenv("REMOTE_GUI_TEST_STANDIN") != "" {
		session.BrowserLauncher = standInLauncher
	}
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

// fakeVNC accepts x11vnc's password handshake and ignores every key, so the
// native Exit request reaches it and Chromium never quits.
func fakeVNC(file string) int {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 1
	}
	if err = os.WriteFile(file+".tmp", []byte(listener.Addr().String()), 0o600); err != nil || os.Rename(file+".tmp", file) != nil {
		return 1
	}
	for {
		conn, err := listener.Accept()
		if err != nil {
			return 1
		}
		go func() {
			defer func() { _ = conn.Close() }()
			var buffer [24]byte
			_, _ = io.WriteString(conn, "RFB 003.008\n")
			if _, err := io.ReadFull(conn, buffer[:12]); err != nil {
				return
			}
			_, _ = conn.Write([]byte{1, 2})
			if _, err := io.ReadFull(conn, buffer[:1]); err != nil {
				return
			}
			_, _ = conn.Write(make([]byte, 16))
			if _, err := io.ReadFull(conn, buffer[:16]); err != nil {
				return
			}
			_, _ = conn.Write([]byte{0, 0, 0, 0})
			if _, err := io.ReadFull(conn, buffer[:1]); err != nil {
				return
			}
			_, _ = conn.Write(make([]byte, 24))
			for {
				if _, err := io.ReadFull(conn, buffer[:8]); err != nil {
					return
				}
				if buffer[0] == 4 && buffer[1] == 1 && buffer[7] == 'x' {
					f, e := os.OpenFile(file+".exit", os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
					if e == nil {
						_, _ = io.WriteString(f, "exit-requested\n")
						_ = f.Close()
					}
				}
			}
		}()
	}
}

// stubbornBrowser stands in for a Chromium that ignores both Exit and SIGTERM,
// recording when each SIGTERM arrives.
func stubbornBrowser(file string) int {
	terms := make(chan os.Signal, 4)
	signal.Notify(terms, syscall.SIGTERM)
	for range terms {
		f, err := os.OpenFile(file, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
		if err == nil {
			_, _ = io.WriteString(f, strconv.FormatInt(time.Now().UnixNano(), 10)+"\n")
			_ = f.Close()
		}
	}
	return 0
}

func waitFile(path string, limit time.Duration) (string, error) {
	deadline := time.Now().Add(limit)
	for time.Now().Before(deadline) {
		if data, err := os.ReadFile(path); err == nil {
			return string(data), nil
		}
		time.Sleep(10 * time.Millisecond)
	}
	return "", errors.New("helper did not report " + filepath.Base(path))
}

func helper(t *testing.T, role, variable, file string) *child {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^$")
	cmd.Env = append(os.Environ(), variable+"="+file)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { _ = cmd.Wait(); close(done) }()
	t.Cleanup(func() { _ = cmd.Process.Kill(); <-done })
	identity, err := state.Inspect(cmd.Process.Pid)
	if err != nil {
		t.Fatal(err)
	}
	return &child{role: role, identity: identity, done: done}
}

func termTimes(file string) []time.Time {
	data, _ := os.ReadFile(file)
	var times []time.Time
	for _, line := range strings.Fields(string(data)) {
		if n, err := strconv.ParseInt(line, 10, 64); err == nil {
			times = append(times, time.Unix(0, n))
		}
	}
	return times
}

func TestReusableStopTerminatesThenKillsAStubbornBrowser(t *testing.T) {
	c, id := setup(t)
	dir := t.TempDir()
	vnc := helper(t, "vnc", "REMOTE_GUI_TEST_FAKE_VNC", filepath.Join(dir, "vnc"))
	address, err := waitFile(filepath.Join(dir, "vnc"), 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	chrome := helper(t, "browser", "REMOTE_GUI_TEST_STUBBORN", filepath.Join(dir, "term"))
	time.Sleep(200 * time.Millisecond)
	kept := filepath.Join(dir, "chromium")
	if err = os.Mkdir(kept, 0o700); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(kept, "Cookies"), []byte("kept"), 0o600); err != nil {
		t.Fatal(err)
	}
	r := &runtime{home: c.Home, id: id, reusable: true, profile: kept, chrome: chrome, children: []*child{vnc, chrome}, vncAddress: address}
	r.current.Password = "fixture"
	died := make(chan time.Time, 1)
	go func() { <-chrome.done; died <- time.Now() }()
	begin := time.Now()
	r.stop()
	elapsed := time.Since(begin)
	if _, err = os.Stat(filepath.Join(dir, "vnc.exit")); err != nil {
		t.Fatal("the native Exit request was not sent")
	}
	terms := termTimes(filepath.Join(dir, "term"))
	if len(terms) == 0 {
		t.Fatal("stubborn browser received no SIGTERM")
	}
	var death time.Time
	select {
	case death = <-died:
	default:
		t.Fatal("stubborn browser survived stop")
	}
	if wait := terms[0].Sub(begin); wait < 1900*time.Millisecond || wait > 2600*time.Millisecond {
		t.Fatalf("SIGTERM after %v, want about two seconds", wait)
	}
	if wait := death.Sub(terms[0]); wait < 900*time.Millisecond || wait > 1600*time.Millisecond {
		t.Fatalf("SIGKILL %v after SIGTERM, want about one second", wait)
	}
	if elapsed > 4500*time.Millisecond {
		t.Fatalf("stop took %v, past the guard's five-second supervisor deadline", elapsed)
	}
	if data, err := os.ReadFile(filepath.Join(kept, "Cookies")); err != nil || string(data) != "kept" {
		t.Fatal("stop deleted the reusable profile")
	}
}

func TestReusableProfileLaunchPreparation(t *testing.T) {
	c, id := setup(t)
	profiles := filepath.Join(t.TempDir(), "profiles")
	held, err := profile.Acquire(profiles, "work")
	if err != nil {
		t.Fatal(err)
	}
	held.Release()
	c.Profile, c.ProfileHome = "work", profiles
	r := &runtime{home: c.Home, id: id}
	if err = r.prepare(c); err != nil {
		t.Fatal(err)
	}
	chromium := filepath.Join(profiles, "work", "chromium")
	downloads := filepath.Join(c.Home, id, "downloads")
	if r.profile != chromium || r.downloads != downloads || !r.reusable {
		t.Fatalf("profile paths: %q %q %v", r.profile, r.downloads, r.reusable)
	}
	if info, e := os.Lstat(downloads); e != nil || info.Mode() != os.ModeDir|0o700 {
		t.Fatal("session downloads directory missing")
	}
	if _, e := os.Lstat(filepath.Join(c.Home, id, "profile")); !os.IsNotExist(e) {
		t.Fatal("a reusable-profile session created a disposable profile")
	}
	prefs := func() map[string]any {
		data, e := os.ReadFile(filepath.Join(chromium, "Default", "Preferences"))
		if e != nil {
			t.Fatal(e)
		}
		var out map[string]any
		if e = json.Unmarshal(data, &out); e != nil {
			t.Fatal(e)
		}
		return out
	}
	args, err := r.prepareLaunch("human", 1)
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(args, "--restore-last-session") || !slices.Contains(args, "--user-data-dir="+chromium) {
		t.Fatalf("first launch arguments: %v", args)
	}
	first := prefs()
	if first["profile"].(map[string]any)["exit_type"] != "Normal" || first["session"].(map[string]any)["restore_on_startup"] != float64(5) || first["download"].(map[string]any)["default_directory"] != downloads {
		t.Fatalf("first launch preferences: %v", first)
	}
	args, err = r.prepareLaunch("agent", 2)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(args, "--restore-last-session") || prefs()["session"].(map[string]any)["restore_on_startup"] != float64(1) {
		t.Fatalf("handoff launch does not restore the last session: %v", args)
	}
	d, did := setup(t)
	disposable := &runtime{home: d.Home, id: did}
	if err = disposable.prepare(d); err != nil {
		t.Fatal(err)
	}
	if disposable.reusable || disposable.profile != filepath.Join(d.Home, did, "profile") {
		t.Fatal("a session without a profile lost its fresh disposable profile")
	}
	if args, err = disposable.prepareLaunch("human", 1); err != nil || !slices.Contains(args, "--restore-last-session") {
		t.Fatalf("disposable first launch changed: %v %v", args, err)
	}
}

// standInLauncher runs in the re-executed supervisor. It prepares the reusable
// profile like a real launch, then runs the fake VNC and the stubborn browser
// in place of x11vnc and Chromium.
func standInLauncher(_ context.Context, c config.Config, id string) (session.BrowserHandle, error) {
	var empty session.BrowserHandle
	dir := os.Getenv("REMOTE_GUI_TEST_STANDIN")
	r := &runtime{home: c.Home, id: id}
	if err := r.prepare(c); err != nil {
		return empty, err
	}
	if _, err := r.prepareLaunch(c.Mode(), r.generation.Add(1)); err != nil {
		return empty, err
	}
	vncFile := filepath.Join(dir, "vnc-"+id)
	if _, err := r.spawn("vnc", os.Args[0], []string{"-test.run=^$"}, append(os.Environ(), "REMOTE_GUI_TEST_FAKE_VNC="+vncFile)); err != nil {
		return empty, err
	}
	address, err := waitFile(vncFile, 5*time.Second)
	if err != nil {
		return empty, err
	}
	chrome, err := r.spawn("browser", os.Args[0], []string{"-test.run=^$"}, append(os.Environ(), "REMOTE_GUI_TEST_STUBBORN="+filepath.Join(dir, "term-"+id)))
	if err != nil {
		return empty, err
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return empty, err
	}
	viewer := &http.Server{ReadHeaderTimeout: time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		conn, buffered, e := http.NewResponseController(w).Hijack()
		if e != nil {
			return
		}
		sum := sha1.Sum([]byte(req.Header.Get("Sec-WebSocket-Key") + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
		_, _ = buffered.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + base64.StdEncoding.EncodeToString(sum[:]) + "\r\n\r\n")
		_ = buffered.Flush()
		_, _ = io.Copy(io.Discard, conn)
		_ = conn.Close()
	})}
	go func() { _ = viewer.Serve(listener) }()
	r.chrome, r.vncAddress, r.modeReady = chrome, address, true
	r.current = session.BrowserHandle{BrowserMode: c.Mode(), Target: "http://" + listener.Addr().String() + "/vnc.html", Assets: dir, Password: "fixture"}
	handle := r.snapshot()
	handle.Stop = func() {
		r.stop()
		_ = viewer.Close()
		_ = os.WriteFile(filepath.Join(dir, "stopped-"+id), nil, 0o600)
	}
	return handle, nil
}

func TestReusableProfileStopAndExpiryWithStubbornBrowser(t *testing.T) {
	for _, ending := range []string{"stop", "expiry"} {
		t.Run(ending, func(t *testing.T) {
			base, err := os.MkdirTemp("/tmp", "rg-standin-")
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = os.RemoveAll(base) })
			home, profiles, dir := filepath.Join(base, "s"), filepath.Join(base, "p"), filepath.Join(base, "d")
			if err = os.Mkdir(dir, 0o700); err != nil {
				t.Fatal(err)
			}
			version := filepath.Join(dir, "chromium")
			if err = os.WriteFile(version, []byte("#!/bin/sh\necho 'Chromium 151.0.7922.137'\n"), 0o700); err != nil {
				t.Fatal(err)
			}
			t.Setenv("REMOTE_GUI_TEST_STANDIN", dir)
			t.Setenv("REMOTE_GUI_CHROMIUM", version)
			ttl := "1m"
			if ending == "expiry" {
				ttl = "4s"
			}
			c, err := config.Parse([]string{"start", "--home", home, "--profile-home", profiles, "--profile", "work", "--transport", "loopback", "--ttl", ttl})
			if err != nil {
				t.Fatal(err)
			}
			v, err := session.Start(c)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _, _ = session.Stop(home, v.ID) })
			record, err := state.Load(home, v.ID)
			if err != nil {
				t.Fatal(err)
			}
			var chrome state.Identity
			for _, p := range record.Owned {
				if p.Role == "browser" {
					chrome = p.Identity
				}
			}
			if ending == "stop" {
				begin := time.Now()
				end, err := session.Stop(home, v.ID)
				if err != nil || end.State != "stopped" || time.Since(begin) > 10*time.Second {
					t.Fatalf("stop: %+v %v after %v", end, err, time.Since(begin))
				}
			} else {
				deadline := time.Now().Add(15 * time.Second)
				for {
					end, e := session.Read(home, v.ID)
					if e == nil && end.State == "stopped" {
						break
					}
					if time.Now().After(deadline) {
						t.Fatalf("expiry did not stop the session: %+v %v", end, e)
					}
					time.Sleep(50 * time.Millisecond)
				}
			}
			if _, err = os.Stat(filepath.Join(dir, "stopped-"+v.ID)); err != nil {
				t.Fatal("the supervisor did not finish its browser stop before the guard's deadline")
			}
			if len(termTimes(filepath.Join(dir, "term-"+v.ID))) == 0 || state.Alive(chrome) {
				t.Fatal("the stubborn browser was not terminated and killed")
			}
			held, err := profile.Acquire(profiles, "work")
			if err != nil {
				t.Fatalf("profile still held after %s: %v", ending, err)
			}
			m, _, err := held.Meta()
			if err != nil || m.HolderID != "" {
				held.Release()
				t.Fatalf("holder not cleared after %s: %+v %v", ending, m, err)
			}
			preferences := filepath.Join(held.Chromium(), "Default", "Preferences")
			data, err := os.ReadFile(preferences)
			if err != nil {
				t.Fatal(err)
			}
			var prefs map[string]any
			if err = json.Unmarshal(data, &prefs); err != nil {
				t.Fatal(err)
			}
			prefs["profile"].(map[string]any)["exit_type"] = "Crashed"
			data, _ = json.Marshal(prefs)
			if err = os.WriteFile(preferences, data, 0o600); err != nil {
				t.Fatal(err)
			}
			held.Release()
			next, err := session.Start(c)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _, _ = session.Stop(home, next.ID) })
			if data, err = os.ReadFile(preferences); err != nil || json.Unmarshal(data, &prefs) != nil || prefs["profile"].(map[string]any)["exit_type"] != "Normal" {
				t.Fatalf("next first launch did not mark a clean exit: %s", data)
			}
		})
	}
}
