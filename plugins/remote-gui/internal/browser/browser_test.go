package browser

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/session"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/xclip"
)

func setup(t *testing.T) (config.Config, string) {
	t.Helper()
	home, err := os.MkdirTemp("/tmp", "rg-browser-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ids, _ := state.IDs(home)
		for _, id := range ids {
			r, e := state.Load(home, id)
			if e == nil {
				for _, child := range r.Owned {
					if state.Alive(child.Identity) {
						t.Log("retained owned cleanup record", home)
						return
					}
				}
				if r.State == "cleanup-pending" {
					t.Log("retained cleanup-pending record", home)
					return
				}
			}
		}
		_ = os.RemoveAll(home)
	})
	id, err := state.New(home)
	if err != nil {
		t.Fatal(err)
	}
	c, err := config.Parse([]string{"start", "--transport", "loopback", "--home", home})
	if err != nil {
		t.Fatal(err)
	}
	self, err := state.Inspect(os.Getpid())
	if err != nil {
		t.Fatal(err)
	}
	if err = state.Save(home, state.Record{Version: 1, ID: id, Kind: "browser", State: "starting", Config: c, Guard: self, Supervisor: self, Expires: time.Now().Add(time.Minute)}); err != nil {
		t.Fatal(err)
	}
	return c, id
}

func TestMissingDependenciesLeaveNoProfile(t *testing.T) {
	c, id := setup(t)
	t.Setenv("REMOTE_GUI_XVFB", filepath.Join(t.TempDir(), "absent"))
	if _, err := Start(context.Background(), c, id); err == nil {
		t.Fatal("missing GUI dependency accepted")
	}
	if _, err := os.Stat(filepath.Join(c.Home, id, "profile")); !os.IsNotExist(err) {
		t.Fatal("failed dependency check created browser profile")
	}
}

func TestBrowserPhaseArguments(t *testing.T) {
	const profile = "/owned/session/profile"
	const marker = "http://127.0.0.1:12345/"
	for _, mode := range []string{"human", "agent"} {
		t.Run(mode, func(t *testing.T) {
			args := browserArgs(profile, marker, mode)
			foundProfile, foundMarker, foundAutomation, foundDebug := false, false, false, false
			for _, arg := range args {
				foundProfile = foundProfile || arg == "--user-data-dir="+profile
				foundMarker = foundMarker || arg == marker
				foundAutomation = foundAutomation || arg == "--enable-automation"
				foundDebug = foundDebug || strings.HasPrefix(arg, "--remote-debugging-")
				if strings.HasPrefix(arg, "--no-sandbox") || strings.Contains(arg, "AutomationControlled") {
					t.Fatal("unsafe or spoofed browser launch")
				}
			}
			if !foundProfile || !foundMarker {
				t.Fatal("owned profile/marker missing")
			}
			if mode == "human" && (foundAutomation || foundDebug) {
				t.Fatal("human phase exposes browser automation")
			}
			if mode == "agent" && (!foundAutomation || !foundDebug) {
				t.Fatal("legacy agent control missing")
			}
		})
	}
}

func TestVNCArgumentsLeaveSelectionsToTheHelper(t *testing.T) {
	want := []string{"-display", ":123", "-localhost", "-rfbport", "5901", "-rfbauth", "/owned/session/vnc.passwd", "-forever", "-shared", "-noxdamage", "-nosel", "-quiet"}
	if got := vncArgs(":123", "5901", "/owned/session/vnc.passwd"); !slices.Equal(got, want) {
		t.Fatalf("x11vnc arguments: %q", got)
	}
}

func TestRealHumanBrowserHandoff(t *testing.T) {
	if os.Getenv("REMOTE_GUI_BROWSER_E2E") != "1" {
		t.Skip("requires existing GUI dependencies and disposable browser processes")
	}
	c, id := setup(t)
	c.BrowserMode = "human"
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	if err := state.Update(ctx, c.Home, id, func(record *state.Record) { record.Config = c }); err != nil {
		t.Fatal(err)
	}
	h, err := Start(ctx, c, id)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Stop()
	if h.CDPAddress != "" || h.MarkerURL == "" || h.Handoff == nil {
		t.Fatal("human phase metadata or control boundary invalid")
	}
	checkHumanProcess(t, h.Owned)
	agent, err := h.Handoff(ctx, "agent")
	if err != nil {
		t.Fatal(err)
	}
	if agent.CDPAddress == "" || agent.Target != h.Target || agent.MarkerURL != h.MarkerURL {
		t.Fatal("hand-back lost browser control or viewer/marker identity")
	}
	repeated, err := agent.Handoff(ctx, "agent")
	if err != nil {
		t.Fatal(err)
	}
	if repeated.CDPAddress != agent.CDPAddress {
		t.Fatal("repeated handoff restarted an already matching browser")
	}
	human, err := repeated.Handoff(ctx, "human")
	if err != nil {
		t.Fatal(err)
	}
	if human.CDPAddress != "" || human.Target != h.Target || human.MarkerURL != h.MarkerURL {
		t.Fatal("return to human mode lost its control boundary or viewer")
	}
	checkHumanProcess(t, human.Owned)
}

// A busy host can delay Chromium's handling of the Exit keys. Pausing the
// browser process while they are typed makes that delay deterministic: the
// menu opens only after the pause, and its Exit mnemonic must not arrive first.
func TestRealHandoffWaitsForStalledBrowserMenu(t *testing.T) {
	if os.Getenv("REMOTE_GUI_BROWSER_E2E") != "1" {
		t.Skip("requires existing GUI dependencies and disposable browser processes")
	}
	c, id := setup(t)
	c.BrowserMode = "human"
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	if err := state.Update(ctx, c.Home, id, func(record *state.Record) { record.Config = c }); err != nil {
		t.Fatal(err)
	}
	h, err := Start(ctx, c, id)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Stop()
	var browser state.Identity
	for _, process := range h.Owned {
		if process.Role == "browser" {
			browser = process.Identity
		}
	}
	if err = state.Signal(browser, syscall.SIGSTOP); err != nil {
		t.Fatal(err)
	}
	resumed := make(chan struct{})
	go func() {
		defer close(resumed)
		time.Sleep(time.Second)
		_ = state.Signal(browser, syscall.SIGCONT)
	}()
	agent, err := h.Handoff(ctx, "agent")
	<-resumed
	if err != nil {
		t.Fatal(err)
	}
	if agent.CDPAddress == "" || agent.MarkerURL != h.MarkerURL {
		t.Fatal("hand-back after a stalled browser lost control or the marker")
	}
}

func checkHumanProcess(t *testing.T, owned []state.Process) {
	t.Helper()
	found := false
	for _, process := range owned {
		if process.Role != "browser" {
			continue
		}
		found = true
		if !state.Alive(process.Identity) {
			t.Fatal("owned human browser is not alive")
		}
		data, err := os.ReadFile("/proc/" + strconv.Itoa(process.Identity.PID) + "/cmdline")
		if err != nil {
			t.Fatal(err)
		}
		for _, arg := range strings.Split(string(data), "\x00") {
			if arg == "--enable-automation" || strings.HasPrefix(arg, "--remote-debugging-") {
				t.Fatal("human browser has an automation/debugging switch")
			}
		}
	}
	if !found {
		t.Fatal("owned human browser missing")
	}
}

func TestDisplayAllocationPreservesForeignLock(t *testing.T) {
	start := 42000 + os.Getpid()%1000
	name := "/tmp/.X" + strconv.Itoa(start) + "-lock"
	f, err := os.OpenFile(name, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if os.IsExist(err) {
		t.Skip("disposable test display already occupied")
	}
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.WriteString(f, "foreign-sentinel")
	_ = f.Close()
	t.Cleanup(func() { _ = os.Remove(name) })
	display, err := chooseDisplay(start)
	if err != nil || display == start {
		t.Fatal("foreign display lock was reused")
	}
	data, err := os.ReadFile(name)
	if err != nil || string(data) != "foreign-sentinel" {
		t.Fatal("foreign display lock changed")
	}
}

func TestRealHeadedBrowser(t *testing.T) {
	if os.Getenv("REMOTE_GUI_BROWSER_E2E") != "1" {
		t.Skip("set REMOTE_GUI_BROWSER_E2E=1 with existing host GUI dependencies")
	}
	c, id := setup(t)
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	h, err := Start(ctx, c, id)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Stop()
	if h.CDPAddress == "" || h.Marker == "" || len(h.Owned) < 4 {
		t.Fatal("browser identity metadata missing")
	}
	resp, err := http.Get(h.CDPAddress + "/json/list")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	var pages []struct{ Title string }
	if err = json.NewDecoder(resp.Body).Decode(&pages); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, p := range pages {
		if strings.Contains(p.Title, h.Marker) {
			found = true
		}
	}
	if !found {
		t.Fatal("session marker missing from actual headed browser")
	}
	for _, p := range h.Owned {
		if !state.Alive(p.Identity) {
			t.Fatalf("owned %s process not alive", p.Role)
		}
	}
	h.Stop()
	for _, p := range h.Owned {
		if state.Alive(p.Identity) {
			t.Fatalf("owned %s process survived stop", p.Role)
		}
	}
	if _, err = os.Stat(filepath.Join(c.Home, id, "profile")); !os.IsNotExist(err) {
		t.Fatal("temporary profile survived stop")
	}
}

func TestFailedDisplayStartupRollsBack(t *testing.T) {
	c, id := setup(t)
	assets := t.TempDir()
	if err := os.WriteFile(filepath.Join(assets, "vnc.html"), []byte("fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"REMOTE_GUI_XVFB", "REMOTE_GUI_X11VNC", "REMOTE_GUI_WEBSOCKIFY", "REMOTE_GUI_CHROMIUM", "REMOTE_GUI_XAUTH"} {
		t.Setenv(key, "/usr/bin/false")
	}
	t.Setenv("REMOTE_GUI_NOVNC", assets)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := Start(ctx, c, id); err == nil {
		t.Fatal("failed browser startup accepted")
	}
	for _, name := range []string{"profile", "downloads", "Xauthority", "vnc.passwd"} {
		if _, err := os.Lstat(filepath.Join(c.Home, id, name)); !os.IsNotExist(err) {
			t.Fatalf("private %s survived rollback", name)
		}
	}
}

// viewerSession starts a loopback browser session and an enrolled HTTP client for its viewer origin.
type viewerSession struct {
	home, id, origin, code string
	cookie                 *http.Cookie
	client                 *http.Client
}

func startViewerSession(t *testing.T, mode string) *viewerSession {
	t.Helper()
	home, err := os.MkdirTemp("/tmp", "rg-clip-")
	if err != nil {
		t.Fatal(err)
	}
	c, err := config.Parse([]string{"start", "--home", home, "--transport", "loopback", "--ttl", "3m", "--browser-mode", mode})
	if err != nil {
		t.Fatal(err)
	}
	v, err := session.Start(c)
	if err != nil {
		t.Fatal(err)
	}
	s := &viewerSession{home: home, id: v.ID}
	t.Cleanup(func() {
		end, e := session.Stop(home, v.ID)
		if e == nil && end.State != "cleanup-pending" {
			_ = os.RemoveAll(home)
		} else {
			t.Log("retained owned browser cleanup record", home)
		}
	})
	access, err := session.Access(home, v.ID, true)
	if err != nil {
		t.Fatal("test enrollment unavailable")
	}
	origin, _ := url.Parse(v.URL)
	s.origin, s.code = origin.Scheme+"://"+origin.Host, access.AccessCode
	transport := &http.Transport{Proxy: nil}
	t.Cleanup(transport.CloseIdleConnections)
	s.client = &http.Client{Timeout: 40 * time.Second, Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	request, _ := http.NewRequest(http.MethodGet, s.origin+"/?__remote_gui_enroll=1", nil)
	request.SetBasicAuth("viewer", s.code)
	response, err := s.client.Do(request)
	if err != nil {
		t.Fatal("test enrollment failed")
	}
	_ = response.Body.Close()
	if response.StatusCode != 303 || len(response.Cookies()) != 1 {
		t.Fatal("test enrollment rejected")
	}
	s.cookie = response.Cookies()[0]
	return s
}

func (s *viewerSession) clipboard(t *testing.T, method, query, body string) (int, map[string]string) {
	t.Helper()
	request, _ := http.NewRequest(method, s.origin+"/__remote_gui/clipboard"+query, strings.NewReader(body))
	request.SetBasicAuth("viewer", s.code)
	request.AddCookie(s.cookie)
	request.Header.Set("X-Remote-GUI-Clipboard", "1")
	request.Header.Set("Sec-Fetch-Site", "same-origin")
	if method != http.MethodGet {
		request.Header.Set("Origin", s.origin)
	}
	if method == http.MethodPost {
		request.Header.Set("Content-Type", "text/plain; charset=utf-8")
	}
	response, err := s.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	reply := map[string]string{}
	_ = json.NewDecoder(response.Body).Decode(&reply)
	return response.StatusCode, reply
}

// viewerSocket opens the viewer's WebSocket through the proxy, as noVNC does.
func (s *viewerSession) viewerSocket(t *testing.T) (net.Conn, *bufio.Reader) {
	t.Helper()
	host := strings.TrimPrefix(s.origin, "http://")
	socket, err := net.DialTimeout("tcp", host, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = socket.Close() })
	request, _ := http.NewRequest(http.MethodGet, s.origin+"/websockify", nil)
	request.SetBasicAuth("viewer", s.code)
	request.AddCookie(s.cookie)
	request.Header.Set("Origin", s.origin)
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
		t.Fatal("authenticated viewer upgrade failed")
	}
	return socket, reader
}

// stillOpen drains what the server sent and reports whether the connection is still open.
func stillOpen(socket net.Conn, reader *bufio.Reader) bool {
	_ = socket.SetReadDeadline(time.Now().Add(time.Second))
	_, err := io.Copy(io.Discard, reader)
	timeout, ok := err.(net.Error)
	return ok && timeout.Timeout()
}

func displayProbe(t *testing.T, home, id string) *xclip.Helper {
	t.Helper()
	record, err := state.Load(home, id)
	if err != nil || record.Display == nil {
		t.Fatal("session display unavailable")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	probe, err := xclip.Open(ctx, xclip.Display{Number: record.Display.Number, Authority: filepath.Join(home, id, "Xauthority")})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = probe.Close() })
	return probe
}

func TestRealHandoffClearsTheRemoteClipboard(t *testing.T) {
	if os.Getenv("REMOTE_GUI_BROWSER_E2E") != "1" {
		t.Skip("requires existing GUI dependencies and disposable browser processes")
	}
	s := startViewerSession(t, "human")
	socket, reader := s.viewerSocket(t)
	probe := displayProbe(t, s.home, s.id)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	const sentinel = "human-clipboard-sentinel Zürich € ✓"
	if status, reply := s.clipboard(t, http.MethodPost, "?expected_mode=human", sentinel); status != 200 || reply["browser_mode"] != "human" {
		t.Fatalf("human-mode send: %d %v", status, reply)
	}
	if got, err := probe.Get(ctx); err != nil || got != sentinel {
		t.Fatalf("second connection did not see the send: %v %q", err, got)
	}
	if err := probe.SetCutBuffer(ctx, "human-cut-sentinel"); err != nil {
		t.Fatal(err)
	}
	if exists, err := probe.CutBufferExists(ctx); err != nil || !exists {
		t.Fatalf("cut buffer was not written: %v %v", err, exists)
	}
	// Sends race the handoff; each must be refused or land before the clear.
	done := make(chan error, 1)
	var view session.View
	go func() {
		var err error
		view, err = session.Handoff(s.home, s.id, "agent")
		done <- err
	}()
	statuses := map[int]int{}
	racing := true
	for racing {
		select {
		case err := <-done:
			if err != nil {
				t.Fatalf("handoff to agent: %v", err)
			}
			racing = false
		default:
			status, _ := s.clipboard(t, http.MethodPost, "?expected_mode=human", "racing-sentinel")
			statuses[status]++
			time.Sleep(20 * time.Millisecond)
		}
	}
	for status := range statuses {
		if status != 200 && status != http.StatusConflict {
			t.Fatalf("racing send status %d", status)
		}
	}
	if view.BrowserMode != "agent" || view.State != "ready" {
		t.Fatalf("handoff result: %s %s", view.State, view.BrowserMode)
	}
	for _, selection := range []string{"CLIPBOARD", "PRIMARY"} {
		if owner, err := probe.Owner(ctx, selection); err != nil || owner != 0 {
			t.Fatalf("%s owned after handoff: %v %d", selection, err, owner)
		}
	}
	if exists, err := probe.CutBufferExists(ctx); err != nil || exists {
		t.Fatalf("cut buffer survived handoff: %v %v", err, exists)
	}
	if got, err := probe.Get(ctx); err != nil || got != "" {
		t.Fatalf("agent display holds clipboard text: %v %q", err, got)
	}
	if !stillOpen(socket, reader) {
		t.Fatal("viewer WebSocket closed during handoff")
	}
	if status, reply := s.clipboard(t, http.MethodPost, "?expected_mode=human", "stale-mode-sentinel"); status != http.StatusConflict || reply["error"] != "clipboard-busy" || reply["browser_mode"] != "agent" {
		t.Fatalf("send for the old mode: %d %v", status, reply)
	}
	if got, err := probe.Get(ctx); err != nil || got != "" {
		t.Fatalf("refused send reached the agent display: %v %q", err, got)
	}
	// The Clear route leaves CLIPBOARD without an owner.
	if status, _ := s.clipboard(t, http.MethodPost, "?expected_mode=agent", "agent-clipboard-sentinel"); status != 200 {
		t.Fatalf("agent-mode send: %d", status)
	}
	if owner, err := probe.Owner(ctx, "CLIPBOARD"); err != nil || owner == 0 {
		t.Fatal("agent-mode send did not own CLIPBOARD")
	}
	if status, reply := s.clipboard(t, http.MethodDelete, "", ""); status != 200 || reply["browser_mode"] != "agent" {
		t.Fatalf("clear route: %d %v", status, reply)
	}
	if owner, err := probe.Owner(ctx, "CLIPBOARD"); err != nil || owner != 0 {
		t.Fatalf("CLIPBOARD owned after the clear route: %v %d", err, owner)
	}
	t.Logf("racing sends: %v", statuses)
}

type failingClear struct {
	clipboardHelper
	mu     sync.Mutex
	clears int
}

func (f *failingClear) Clear(ctx context.Context) error {
	f.mu.Lock()
	f.clears++
	first := f.clears == 1
	f.mu.Unlock()
	if first {
		return errors.New("clipboard-clear-unverified")
	}
	return f.clipboardHelper.Clear(ctx)
}

func TestRealFailedClearRetriesIntoAgentMode(t *testing.T) {
	if os.Getenv("REMOTE_GUI_BROWSER_E2E") != "1" {
		t.Skip("requires existing GUI dependencies and disposable browser processes")
	}
	var double *failingClear
	original := openClipboard
	openClipboard = func(ctx context.Context, d xclip.Display) (clipboardHelper, error) {
		real, err := original(ctx, d)
		if err != nil {
			return nil, err
		}
		double = &failingClear{clipboardHelper: real}
		return double, nil
	}
	t.Cleanup(func() { openClipboard = original })
	c, id := setup(t)
	c.BrowserMode = "human"
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	if err := state.Update(ctx, c.Home, id, func(record *state.Record) { record.Config = c }); err != nil {
		t.Fatal(err)
	}
	h, err := Start(ctx, c, id)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Stop()
	failed, err := h.Handoff(ctx, "agent")
	if err == nil || err.Error() != "clipboard-clear-unverified" {
		t.Fatalf("failed clear: %v", err)
	}
	if failed.CDPAddress != "" || slices.ContainsFunc(failed.Owned, func(p state.Process) bool { return p.Role == "browser" }) {
		t.Fatal("failed clear left an agent-mode browser")
	}
	agent, err := failed.Handoff(ctx, "agent")
	if err != nil {
		t.Fatal(err)
	}
	if agent.BrowserMode != "agent" || agent.CDPAddress == "" {
		t.Fatal("retried handoff did not reach ready agent mode")
	}
	double.mu.Lock()
	clears := double.clears
	double.mu.Unlock()
	if clears != 2 {
		t.Fatalf("retry clears: %d", clears)
	}
}
