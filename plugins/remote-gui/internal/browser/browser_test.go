package browser

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"math"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
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
	"unicode/utf16"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/app"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/session"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/tailnet"
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
			args := browserArgs(profile, marker, mode, true)
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

// The reusable-profile cases below need REMOTE_GUI_BROWSER_E2E=1 and the
// host's GUI tools. They use disposable state, profile roots and fixtures.

type cookieFixture struct {
	*httptest.Server
	mu     sync.Mutex
	seen   map[string]string
	inputs []string
	count  atomic.Int64
}

func newCookieFixture(t *testing.T) *cookieFixture {
	t.Helper()
	f := &cookieFixture{seen: map[string]string{}}
	f.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		switch r.URL.Path {
		case "/set":
			http.SetCookie(w, &http.Cookie{Name: "pers", Value: "1", Path: "/", MaxAge: 86400})
			http.SetCookie(w, &http.Cookie{Name: "sess", Value: "1", Path: "/"})
			_, _ = io.WriteString(w, "<!doctype html><title>fixture-set</title><p>set")
		case "/check":
			f.mu.Lock()
			f.seen[r.URL.Query().Get("n")] = r.Header.Get("Cookie")
			f.mu.Unlock()
			_, _ = io.WriteString(w, "<!doctype html><title>fixture-check</title><p>check")
		case "/setp":
			http.SetCookie(w, &http.Cookie{Name: r.URL.Query().Get("name"), Value: "1", Path: "/", MaxAge: 86400})
			_, _ = io.WriteString(w, "<!doctype html><title>fixture-setp</title><p>set")
		case "/form":
			_, _ = io.WriteString(w, `<!doctype html><title>fixture-form</title><form action="/submit"><input name="q" autofocus></form><script>addEventListener('keydown',e=>navigator.sendBeacon('/key?k='+encodeURIComponent(e.key)))</script>`)
		case "/key", "/submit":
			f.mu.Lock()
			f.inputs = append(f.inputs, r.URL.String())
			f.mu.Unlock()
		case "/clip":
			_, _ = io.WriteString(w, `<!doctype html><title>fixture-clip</title><input id="paste" aria-label="Paste target"><input id="source" aria-label="Copy source">`)
		case "/download":
			w.Header().Set("Content-Type", "application/octet-stream")
			w.Header().Set("Content-Disposition", `attachment; filename="fixture.txt"`)
			_, _ = io.WriteString(w, "download-sentinel")
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(f.Close)
	return f
}

type devtoolsPage struct {
	Type, URL, Title, WebSocketDebuggerURL string
}

func devtoolsPages(t *testing.T, cdp string) []devtoolsPage {
	t.Helper()
	response, err := http.Get(cdp + "/json/list")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	var all, pages []devtoolsPage
	if err = json.NewDecoder(response.Body).Decode(&all); err != nil {
		t.Fatal(err)
	}
	for _, p := range all {
		if p.Type == "page" {
			pages = append(pages, p)
		}
	}
	return pages
}

func openTab(t *testing.T, cdp, target, title string) devtoolsPage {
	t.Helper()
	request, _ := http.NewRequest(http.MethodPut, cdp+"/json/new?"+target, nil)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		for _, p := range devtoolsPages(t, cdp) {
			if p.URL == target && (title == "" || p.Title == title) {
				return p
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("tab %s did not load", target)
	return devtoolsPage{}
}

func (f *cookieFixture) cookies(t *testing.T, cdp string) string {
	t.Helper()
	n := strconv.FormatInt(f.count.Add(1), 10)
	openTab(t, cdp, f.URL+"/check?n="+n, "fixture-check")
	f.mu.Lock()
	defer f.mu.Unlock()
	cookie, ok := f.seen[n]
	if !ok {
		t.Fatal("fixture saw no check request")
	}
	return cookie
}

// cdpCall sends one DevTools command over a fresh WebSocket and returns its
// result. It sends no Origin header, which Chromium accepts on loopback.
func cdpCall(t *testing.T, endpoint, method string, params any) json.RawMessage {
	t.Helper()
	u, err := url.Parse(endpoint)
	if err != nil {
		t.Fatal(err)
	}
	conn, err := net.DialTimeout("tcp", u.Host, 3*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	key := make([]byte, 16)
	_, _ = rand.Read(key)
	_, err = fmt.Fprintf(conn, "GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: %s\r\n\r\n", u.RequestURI(), u.Host, base64.StdEncoding.EncodeToString(key))
	if err != nil {
		t.Fatal(err)
	}
	reader := bufio.NewReader(conn)
	response, err := http.ReadResponse(reader, nil)
	if err != nil || response.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("DevTools WebSocket refused: %v", err)
	}
	payload, _ := json.Marshal(map[string]any{"id": 1, "method": method, "params": params})
	if len(payload) >= 1<<16 {
		t.Fatal("DevTools command too large")
	}
	frame := []byte{0x81}
	if n := len(payload); n < 126 {
		frame = append(frame, 0x80|byte(n))
	} else {
		frame = append(frame, 0x80|126, byte(n>>8), byte(n))
	}
	mask := make([]byte, 4)
	_, _ = rand.Read(mask)
	frame = append(frame, mask...)
	for i, b := range payload {
		frame = append(frame, b^mask[i%4])
	}
	if _, err = conn.Write(frame); err != nil {
		t.Fatal(err)
	}
	for {
		header := make([]byte, 2)
		if _, err = io.ReadFull(reader, header); err != nil {
			t.Fatalf("DevTools %s: %v", method, err)
		}
		size := uint64(header[1] & 0x7f)
		switch size {
		case 126:
			var extended [2]byte
			_, err = io.ReadFull(reader, extended[:])
			size = uint64(binary.BigEndian.Uint16(extended[:]))
		case 127:
			var extended [8]byte
			_, err = io.ReadFull(reader, extended[:])
			size = binary.BigEndian.Uint64(extended[:])
		}
		if err != nil || size > 1<<24 {
			t.Fatal("invalid DevTools frame")
		}
		body := make([]byte, size)
		if _, err = io.ReadFull(reader, body); err != nil {
			t.Fatal(err)
		}
		var message struct {
			ID     int             `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  json.RawMessage `json:"error"`
		}
		if json.Unmarshal(body, &message) == nil && message.ID == 1 {
			if message.Error != nil {
				t.Fatalf("DevTools %s: %s", method, message.Error)
			}
			return message.Result
		}
	}
}

// guaranteedLoad is the one-minute load average below which a cookie set 30
// seconds before stop must survive; at or above it persistence is best effort.
const guaranteedLoad = 4.0

func oneMinuteLoad() float64 {
	data, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return math.Inf(1)
	}
	fields := strings.Fields(string(data))
	if len(fields) == 0 {
		return math.Inf(1)
	}
	load, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return math.Inf(1)
	}
	return load
}

// sampleLoad samples the one-minute load average now and every five seconds
// until the returned function is called, which returns the maximum seen. An
// unreadable load counts as infinite, so that run never counts as proof.
func sampleLoad() func() float64 {
	stop, result := make(chan struct{}), make(chan float64, 1)
	go func() {
		peak := oneMinuteLoad()
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				peak = math.Max(peak, oneMinuteLoad())
			case <-stop:
				result <- math.Max(peak, oneMinuteLoad())
				return
			}
		}
	}()
	return sync.OnceValue(func() float64 { close(stop); return <-result })
}

type profileBase struct {
	home, profiles string
}

func newProfileBase(t *testing.T) profileBase {
	t.Helper()
	base, err := os.MkdirTemp("/tmp", "rg-reuse-")
	if err != nil {
		t.Fatal(err)
	}
	b := profileBase{home: filepath.Join(base, "s"), profiles: filepath.Join(base, "p")}
	t.Cleanup(func() {
		for range 50 {
			views, _ := session.Cleanup(context.Background(), b.home)
			pending := false
			for _, v := range views {
				if v.State != "stopped" && v.State != "failed" {
					_, _ = session.Stop(b.home, v.ID)
					pending = true
				}
			}
			if !pending {
				_ = os.RemoveAll(base)
				return
			}
			time.Sleep(100 * time.Millisecond)
		}
		t.Log("retained owned browser cleanup record", base)
	})
	return b
}

func (b profileBase) start(t *testing.T, ttl string, extra ...string) (session.View, error) {
	t.Helper()
	c, err := config.Parse(append([]string{"start", "--home", b.home, "--profile-home", b.profiles, "--profile", "work", "--transport", "loopback", "--ttl", ttl}, extra...))
	if err != nil {
		t.Fatal(err)
	}
	return session.Start(c)
}

func (b profileBase) mustStart(t *testing.T, ttl string, extra ...string) session.View {
	t.Helper()
	v, err := b.start(t, ttl, extra...)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func toAgent(t *testing.T, home, id string) string {
	t.Helper()
	v, err := session.Handoff(home, id, "agent")
	if err != nil || v.CDPAddress == "" {
		t.Fatalf("handoff to agent: %+v %v", v, err)
	}
	return v.CDPAddress
}

func toHuman(t *testing.T, home, id string) {
	t.Helper()
	if v, err := session.Handoff(home, id, "human"); err != nil || v.CDPAddress != "" {
		t.Fatalf("handoff to human: %+v %v", v, err)
	}
}

func owned(t *testing.T, home, id, role string) state.Identity {
	t.Helper()
	r, err := state.Load(home, id)
	if err != nil {
		t.Fatal(err)
	}
	switch role {
	case "guard":
		return r.Guard
	case "supervisor":
		return r.Supervisor
	}
	for _, p := range r.Owned {
		if p.Role == role {
			return p.Identity
		}
	}
	t.Fatalf("no owned %s", role)
	return state.Identity{}
}

func waitState(t *testing.T, home, id, want string, limit time.Duration) {
	t.Helper()
	deadline := time.Now().Add(limit)
	for time.Now().Before(deadline) {
		if v, err := session.Read(home, id); err == nil && v.State == want {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	v, err := session.Read(home, id)
	t.Fatalf("session did not reach %s: %+v %v", want, v, err)
}

func waitDead(t *testing.T, identity state.Identity) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for state.Alive(identity) {
		if time.Now().After(deadline) {
			t.Fatal("process survived")
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// cleanupUntilEnded repeats cleanup until the session is no longer
// cleanup-pending; a session that needed more than one pass reports failed.
func cleanupUntilEnded(t *testing.T, home, id string) {
	t.Helper()
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := session.Cleanup(context.Background(), home); err != nil {
			t.Fatal(err)
		}
		if v, err := session.Read(home, id); err == nil && (v.State == "stopped" || v.State == "failed") {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	v, err := session.Read(home, id)
	t.Fatalf("repeated cleanup left the session cleanup-pending: %+v %v", v, err)
}

func preferences(t *testing.T, b profileBase) map[string]any {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(b.profiles, "work", "chromium", "Default", "Preferences"))
	if err != nil {
		t.Fatal(err)
	}
	var prefs map[string]any
	if err = json.Unmarshal(data, &prefs); err != nil {
		t.Fatal(err)
	}
	return prefs
}

func viewerWorks(t *testing.T, home, id string) {
	t.Helper()
	access, err := session.Access(home, id, true)
	if err != nil {
		t.Fatal(err)
	}
	origin, _ := url.Parse(access.URL)
	client := &http.Client{Timeout: 3 * time.Second, Transport: &http.Transport{Proxy: nil}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	defer client.Transport.(*http.Transport).CloseIdleConnections()
	request, _ := http.NewRequest(http.MethodGet, origin.Scheme+"://"+origin.Host+"/?__remote_gui_enroll=1", nil)
	request.SetBasicAuth("viewer", access.AccessCode)
	enrolled, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	_ = enrolled.Body.Close()
	if enrolled.StatusCode != 303 || len(enrolled.Cookies()) != 1 {
		t.Fatal("viewer enrollment failed")
	}
	request, _ = http.NewRequest(http.MethodGet, access.URL, nil)
	request.SetBasicAuth("viewer", access.AccessCode)
	request.AddCookie(enrolled.Cookies()[0])
	page, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(page.Body)
	_ = page.Body.Close()
	if page.StatusCode != 200 || !strings.Contains(string(body), "Shared browser") {
		t.Fatal("viewer page unavailable")
	}
	if err = tailnet.Probe(context.Background(), origin.Scheme+"://"+origin.Host, enrolled.Cookies()[0], "Basic "+base64.StdEncoding.EncodeToString([]byte("viewer:"+access.AccessCode)), "/vnc.html", "/websockify"); err != nil {
		t.Fatalf("viewer WebSocket unavailable: %v", err)
	}
}

// singletonAnswers connects to the socket SingletonSocket names, without
// removing anything, to see whether some Chromium process still accepts.
func singletonAnswers(b profileBase) bool {
	target, err := os.Readlink(filepath.Join(b.profiles, "work", "chromium", "SingletonSocket"))
	if err != nil {
		return false
	}
	conn, err := net.DialTimeout("unix", target, time.Second)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func TestRealReusableProfileAcrossSessions(t *testing.T) {
	if os.Getenv("REMOTE_GUI_BROWSER_E2E") != "1" {
		t.Skip("set REMOTE_GUI_BROWSER_E2E=1 with existing host GUI dependencies")
	}
	for _, ending := range []string{"stop", "expiry", "sigkill"} {
		t.Run(ending, func(t *testing.T) {
			b := newProfileBase(t)
			fixture := newCookieFixture(t)
			ttl := "3m"
			if ending == "expiry" {
				ttl = "40s"
			}
			one := b.mustStart(t, ttl)
			if one.BrowserMode != "human" || one.Profile != "work" {
				t.Fatalf("profile session did not start in human mode: %+v", one)
			}
			cdp := toAgent(t, b.home, one.ID)
			openTab(t, cdp, fixture.URL+"/set", "fixture-set")
			cookieSet := time.Now()
			window := sampleLoad()
			if cookie := fixture.cookies(t, cdp); !strings.Contains(cookie, "sess=1") || !strings.Contains(cookie, "pers=1") {
				t.Fatalf("fixture cookies not set: %q", cookie)
			}
			toHuman(t, b.home, one.ID)
			cdp = toAgent(t, b.home, one.ID)
			kept := false
			for _, p := range devtoolsPages(t, cdp) {
				kept = kept || p.URL == fixture.URL+"/set"
			}
			if cookie := fixture.cookies(t, cdp); !kept || !strings.Contains(cookie, "sess=1") {
				t.Fatalf("handoff lost the tab (%v) or session cookie (%q)", kept, cookie)
			}
			chrome := owned(t, b.home, one.ID, "browser")
			switch ending {
			case "stop":
				// A cookie written up to about half a minute before stop may be lost.
				time.Sleep(time.Until(cookieSet.Add(31 * time.Second)))
				end, err := session.Stop(b.home, one.ID)
				if err != nil || end.State != "stopped" {
					t.Fatalf("stop: %+v %v", end, err)
				}
			case "expiry":
				waitState(t, b.home, one.ID, "stopped", 60*time.Second)
			case "sigkill":
				for _, role := range []string{"guard", "supervisor"} {
					if err := state.Signal(owned(t, b.home, one.ID, role), syscall.SIGKILL); err != nil {
						t.Fatal(err)
					}
				}
				if err := state.Signal(chrome, syscall.SIGKILL); err != nil {
					t.Fatal(err)
				}
			}
			waitDead(t, chrome)
			// Chromium's helper processes keep its singleton socket open for a
			// moment after the browser process dies; a start then is refused.
			for deadline := time.Now().Add(10 * time.Second); singletonAnswers(b); time.Sleep(20 * time.Millisecond) {
				if time.Now().After(deadline) {
					t.Fatal("killed browser's singleton socket still answers")
				}
			}
			if ending != "sigkill" {
				for _, name := range []string{"downloads", "Xauthority", "vnc.passwd", "control.sock"} {
					if _, err := os.Lstat(filepath.Join(b.home, one.ID, name)); !os.IsNotExist(err) {
						t.Fatalf("private %s survived the session", name)
					}
				}
				if _, err := os.Lstat(filepath.Join(b.home, one.ID, "state.json")); err != nil {
					t.Fatal("stopped record was removed")
				}
			}
			if ending == "stop" {
				prefs := preferences(t, b)
				prefs["bookmark_bar"] = map[string]any{"show_on_all_tabs": true}
				data, _ := json.Marshal(prefs)
				if err := os.WriteFile(filepath.Join(b.profiles, "work", "chromium", "Default", "Preferences"), data, 0o600); err != nil {
					t.Fatal(err)
				}
			}
			two := b.mustStart(t, "3m")
			// Any singleton files the ended session left were recovered: the
			// lock now names the later session's browser.
			lock, err := os.Readlink(filepath.Join(b.profiles, "work", "chromium", "SingletonLock"))
			if err != nil || !strings.HasSuffix(lock, "-"+strconv.Itoa(owned(t, b.home, two.ID, "browser").PID)) {
				t.Fatalf("singleton lock after %s does not name the later browser: %q %v", ending, lock, err)
			}
			if ending == "sigkill" {
				viewerWorks(t, b.home, two.ID)
			}
			cdp = toAgent(t, b.home, two.ID)
			pages := devtoolsPages(t, cdp)
			if len(pages) != 1 || pages[0].URL != two.MarkerURL {
				t.Fatalf("later session restored earlier tabs: %+v", pages)
			}
			cookie := fixture.cookies(t, cdp)
			peak := window()
			if strings.Contains(cookie, "sess=") {
				t.Fatalf("later session cookies after %s: %q", ending, cookie)
			}
			switch {
			case peak >= guaranteedLoad && !strings.Contains(cookie, "pers=1"):
				t.Skipf("%s: maximum one-minute load %.2f, outside the guaranteed condition, lost the persistent cookie: %q", ending, peak, cookie)
			case !strings.Contains(cookie, "pers=1"):
				t.Fatalf("later session lost the persistent cookie after %s at maximum one-minute load %.2f: %q", ending, peak, cookie)
			case peak >= guaranteedLoad:
				t.Logf("%s: maximum one-minute load %.2f, outside the guaranteed condition; the cookie was kept but this run is no proof", ending, peak)
			default:
				t.Logf("%s: maximum one-minute load %.2f through the cookie window, cookie kept", ending, peak)
			}
			if ending == "stop" {
				openTab(t, cdp, fixture.URL+"/download", "")
				downloaded := filepath.Join(b.home, two.ID, "downloads", "fixture.txt")
				deadline := time.Now().Add(10 * time.Second)
				for {
					if data, err := os.ReadFile(downloaded); err == nil && string(data) == "download-sentinel" {
						break
					}
					if time.Now().After(deadline) {
						t.Fatal("download did not land in the later session's directory")
					}
					time.Sleep(50 * time.Millisecond)
				}
				if bar, _ := preferences(t, b)["bookmark_bar"].(map[string]any); bar["show_on_all_tabs"] != true {
					t.Fatal("a preference Chromium saved did not survive the later launch")
				}
			}
			if _, err := session.Stop(b.home, two.ID); err != nil {
				t.Fatal(err)
			}
			if ending == "sigkill" {
				cleanupUntilEnded(t, b.home, one.ID)
			}
		})
	}
}

func handStartedChromium(t *testing.T, dir, userData string) *exec.Cmd {
	t.Helper()
	cmd := exec.Command(app.Tool("REMOTE_GUI_CHROMIUM", "chromium-browser"), "--headless=new", "--no-first-run", "--disable-gpu", "--user-data-dir="+userData, "about:blank")
	cmd.Dir = dir
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = cmd.Process.Kill(); _ = cmd.Wait() })
	return cmd
}

func TestRealReusableProfileStillRunning(t *testing.T) {
	if os.Getenv("REMOTE_GUI_BROWSER_E2E") != "1" {
		t.Skip("set REMOTE_GUI_BROWSER_E2E=1 with existing host GUI dependencies")
	}
	b := newProfileBase(t)
	first := b.mustStart(t, "3m")
	if _, err := session.Stop(b.home, first.ID); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(filepath.Dir(b.profiles), "link")
	if err := os.Symlink(filepath.Join(b.profiles, "work", "chromium"), link); err != nil {
		t.Fatal(err)
	}
	for name, spelling := range map[string][2]string{"relative": {b.profiles, "work/chromium"}, "symlink": {"/", link}} {
		browser := handStartedChromium(t, spelling[0], spelling[1])
		deadline := time.Now().Add(15 * time.Second)
		for !singletonAnswers(b) {
			if time.Now().After(deadline) {
				t.Fatalf("%s: hand-started browser did not lock the profile", name)
			}
			time.Sleep(50 * time.Millisecond)
		}
		before, _ := state.IDs(b.home)
		_, err := b.start(t, "3m")
		if err == nil || !strings.Contains(err.Error(), "profile-browser-still-running") || !strings.Contains(err.Error(), "close the browser") {
			t.Fatalf("%s: live browser not refused: %v", name, err)
		}
		if after, _ := state.IDs(b.home); len(after) != len(before) {
			t.Fatalf("%s: refused start left a record", name)
		}
		_ = browser.Process.Signal(syscall.SIGTERM)
		_ = browser.Wait()
	}
	orphan := b.mustStart(t, "3m")
	chrome := owned(t, b.home, orphan.ID, "browser")
	for _, role := range []string{"guard", "supervisor"} {
		if err := state.Signal(owned(t, b.home, orphan.ID, role), syscall.SIGKILL); err != nil {
			t.Fatal(err)
		}
	}
	time.Sleep(300 * time.Millisecond)
	if !state.Alive(chrome) {
		t.Fatal("Chromium did not outlive its controllers")
	}
	_, err := b.start(t, "3m")
	if err == nil || !strings.Contains(err.Error(), "profile-browser-still-running") || !strings.Contains(err.Error(), orphan.ID) || !strings.Contains(err.Error(), "cleanup") {
		t.Fatalf("diagnostic does not name the orphaned session: %v", err)
	}
	cleanupUntilEnded(t, b.home, orphan.ID)
	next := b.mustStart(t, "3m")
	if _, err = session.Stop(b.home, next.ID); err != nil {
		t.Fatal(err)
	}
}

func TestRealReusableProfileStopSendsNoKeys(t *testing.T) {
	if os.Getenv("REMOTE_GUI_BROWSER_E2E") != "1" {
		t.Skip("set REMOTE_GUI_BROWSER_E2E=1 with existing host GUI dependencies")
	}
	b := newProfileBase(t)
	fixture := newCookieFixture(t)
	v := b.mustStart(t, "3m", "--browser-mode", "agent", "--agent-start-approved")
	openTab(t, v.CDPAddress, fixture.URL+"/form", "fixture-form")
	response, err := http.Get(v.CDPAddress + "/json/version")
	if err != nil {
		t.Fatal(err)
	}
	var version struct{ WebSocketDebuggerURL string }
	err = json.NewDecoder(response.Body).Decode(&version)
	_ = response.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	// A provider sign-in popup: its own focused window holding a form.
	cdpCall(t, version.WebSocketDebuggerURL, "Target.createTarget", map[string]any{"url": fixture.URL + "/form?popup=1", "newWindow": true})
	deadline := time.Now().Add(10 * time.Second)
	for {
		found := false
		for _, p := range devtoolsPages(t, v.CDPAddress) {
			found = found || (p.URL == fixture.URL+"/form?popup=1" && p.Title == "fixture-form")
		}
		if found {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("popup window did not load")
		}
		time.Sleep(50 * time.Millisecond)
	}
	time.Sleep(500 * time.Millisecond)
	if end, err := session.Stop(b.home, v.ID); err != nil || end.State != "stopped" {
		t.Fatalf("stop: %+v %v", end, err)
	}
	time.Sleep(500 * time.Millisecond)
	fixture.mu.Lock()
	defer fixture.mu.Unlock()
	if len(fixture.inputs) != 0 {
		t.Fatalf("stop sent input to a page: %v", fixture.inputs)
	}
}

// TestRealReusableProfileCookieSetBeforeStop chains sessions on one profile:
// each sets a cookie, waits 30 seconds and stops, and the next session must see
// it. It samples the load through each cookie window and needs ten runs whose
// maximum stayed below guaranteedLoad; a run at or above it is logged as outside
// the guaranteed condition, may lose its cookie, and does not count.
func TestRealReusableProfileCookieSetBeforeStop(t *testing.T) {
	if os.Getenv("REMOTE_GUI_BROWSER_E2E") != "1" {
		t.Skip("set REMOTE_GUI_BROWSER_E2E=1 with existing host GUI dependencies")
	}
	const want, limit = 10, 20
	b := newProfileBase(t)
	fixture := newCookieFixture(t)
	previous := ""
	var window func() float64
	counted, loaded, runs := 0, 0, 0
	for {
		v := b.mustStart(t, "3m", "--browser-mode", "agent", "--agent-start-approved")
		if previous != "" {
			cookie := fixture.cookies(t, v.CDPAddress)
			peak, kept := window(), strings.Contains(cookie, previous+"=1")
			switch {
			case peak >= guaranteedLoad:
				loaded++
				t.Logf("run %d: maximum one-minute load %.2f, outside the guaranteed condition, cookie kept: %v", runs, peak, kept)
			case !kept:
				t.Fatalf("run %d: cookie set 30 seconds before stop was lost at maximum one-minute load %.2f: %q", runs, peak, cookie)
			default:
				counted++
				t.Logf("run %d: maximum one-minute load %.2f, cookie kept", runs, peak)
			}
		}
		if counted == want || runs == limit {
			if _, err := session.Stop(b.home, v.ID); err != nil {
				t.Fatal(err)
			}
			break
		}
		runs++
		previous = "c" + strconv.Itoa(runs)
		openTab(t, v.CDPAddress, fixture.URL+"/setp?name="+previous, "fixture-setp")
		window = sampleLoad()
		time.Sleep(30 * time.Second)
		if end, err := session.Stop(b.home, v.ID); err != nil || end.State != "stopped" {
			t.Fatalf("run %d stop: %+v %v", runs, end, err)
		}
	}
	t.Logf("%d runs below load %.0f kept their cookie; %d runs at or above it did not count", counted, guaranteedLoad, loaded)
	if counted < want {
		t.Fatalf("only %d of %d runs stayed below load %.0f; rerun on a quieter host", counted, runs, guaranteedLoad)
	}
}

func TestRealReusableProfileDeleteWhileBrowserRuns(t *testing.T) {
	if os.Getenv("REMOTE_GUI_BROWSER_E2E") != "1" {
		t.Skip("set REMOTE_GUI_BROWSER_E2E=1 with existing host GUI dependencies")
	}
	b := newProfileBase(t)
	v := b.mustStart(t, "3m")
	chrome := owned(t, b.home, v.ID, "browser")
	for _, role := range []string{"guard", "supervisor"} {
		if err := state.Signal(owned(t, b.home, v.ID, role), syscall.SIGKILL); err != nil {
			t.Fatal(err)
		}
	}
	time.Sleep(300 * time.Millisecond)
	if !state.Alive(chrome) {
		t.Fatal("Chromium did not outlive its controllers")
	}
	dir := filepath.Join(b.profiles, "work")
	_, err := session.ProfileDelete(b.home, b.profiles, "work")
	if err == nil || !strings.Contains(err.Error(), "profile-browser-still-running") || !strings.Contains(err.Error(), v.ID) {
		t.Fatalf("deleted a profile a running Chromium uses: %v", err)
	}
	for _, path := range []string{"meta.json", ".lock", "chromium/Default/Preferences", "chromium/SingletonLock"} {
		if _, e := os.Lstat(filepath.Join(dir, path)); e != nil {
			t.Fatalf("refused delete changed the profile: %s %v", path, e)
		}
	}
	if !state.Alive(chrome) {
		t.Fatal("refused delete disturbed the browser")
	}
	cleanupUntilEnded(t, b.home, v.ID)
	waitDead(t, chrome)
	deleted, err := session.ProfileDelete(b.home, b.profiles, "work")
	if err != nil || deleted.Result != "deleted" {
		t.Fatalf("delete after cleanup: %+v %v", deleted, err)
	}
	if _, err = os.Lstat(dir); !os.IsNotExist(err) {
		t.Fatal("deleted profile directory remains")
	}
	if listed, e := session.ProfileList(b.profiles); e != nil || len(listed) != 0 {
		t.Fatalf("deleted profile still listed: %+v %v", listed, e)
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
	t.Cleanup(func() {
		end, e := session.Stop(home, v.ID)
		if e == nil && end.State != "cleanup-pending" {
			_ = os.RemoveAll(home)
		} else {
			t.Log("retained owned browser cleanup record", home)
		}
	})
	return enrollViewer(t, home, v.ID)
}

// enrollViewer enrolls an HTTP client for a running session's viewer origin.
func enrollViewer(t *testing.T, home, id string) *viewerSession {
	t.Helper()
	s := &viewerSession{home: home, id: id}
	access, err := session.Access(home, id, true)
	if err != nil {
		t.Fatal("test enrollment unavailable")
	}
	origin, _ := url.Parse(access.URL)
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
		// A fresh human browser occasionally misses the native Exit menu, which the
		// product reports as a retryable close failure; retry that once.
		if err != nil && strings.Contains(err.Error(), "browser-close-needs-owner") {
			view, err = session.Handoff(s.home, s.id, "agent")
		}
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

// evaluate runs a JavaScript expression in a page through DevTools and returns its value.
func evaluate(t *testing.T, page devtoolsPage, expression string) any {
	t.Helper()
	raw := cdpCall(t, page.WebSocketDebuggerURL, "Runtime.evaluate", map[string]any{"expression": expression, "returnByValue": true})
	var reply struct {
		Result struct {
			Value any `json:"value"`
		} `json:"result"`
	}
	if err := json.Unmarshal(raw, &reply); err != nil {
		t.Fatal(err)
	}
	return reply.Result.Value
}

// editCommand presses a key in the page with Chromium's matching editing command, as Ctrl+V or Ctrl+C would.
func editCommand(t *testing.T, page devtoolsPage, key, command string) {
	t.Helper()
	code := strings.ToUpper(key)
	cdpCall(t, page.WebSocketDebuggerURL, "Input.dispatchKeyEvent", map[string]any{"type": "rawKeyDown", "key": key, "code": "Key" + code, "windowsVirtualKeyCode": int(code[0]), "modifiers": 2, "commands": []string{command}})
	cdpCall(t, page.WebSocketDebuggerURL, "Input.dispatchKeyEvent", map[string]any{"type": "keyUp", "key": key, "code": "Key" + code, "windowsVirtualKeyCode": int(code[0]), "modifiers": 2})
}

// filesHolding lists the regular files under root whose bytes contain text in
// UTF-8 or UTF-16LE. Symlinks, such as Chromium's singleton files, are skipped.
func filesHolding(t *testing.T, root, text string) []string {
	t.Helper()
	wide := make([]byte, 0, 2*len(text))
	for _, unit := range utf16.Encode([]rune(text)) {
		wide = append(wide, byte(unit), byte(unit>>8))
	}
	var found []string
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || !entry.Type().IsRegular() {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if bytes.Contains(data, []byte(text)) || bytes.Contains(data, wide) {
			found = append(found, path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return found
}

func randomLabel(t *testing.T, prefix string) string {
	t.Helper()
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		t.Fatal(err)
	}
	return prefix + "-" + fmt.Sprintf("%x", b)
}

// TestRealReusableProfileClipboard keeps the clipboard feature's behaviour on a
// profile session: a handoff to agent empties CLIPBOARD, PRIMARY and the cut
// buffer; a sentinel sent and read back through the panel, never pasted, is in
// no profile file after stop; the next session's panel starts empty and sends
// and reads text through a remote page.
func TestRealReusableProfileClipboard(t *testing.T) {
	if os.Getenv("REMOTE_GUI_BROWSER_E2E") != "1" {
		t.Skip("set REMOTE_GUI_BROWSER_E2E=1 with existing host GUI dependencies")
	}
	b := newProfileBase(t)
	fixture := newCookieFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	one := b.mustStart(t, "3m")
	if one.BrowserMode != "human" {
		t.Fatalf("profile session did not start in human mode: %+v", one)
	}
	viewer := enrollViewer(t, b.home, one.ID)
	probe := displayProbe(t, b.home, one.ID)
	privacy := randomLabel(t, "profile-clipboard-sentinel")
	if status, reply := viewer.clipboard(t, http.MethodPost, "?expected_mode=human", privacy); status != 200 || reply["browser_mode"] != "human" {
		t.Fatalf("panel send: %d %v", status, reply)
	}
	if status, reply := viewer.clipboard(t, http.MethodGet, "", ""); status != 200 || reply["text"] != privacy {
		t.Fatalf("panel read back: %d %v", status, reply)
	}
	if err := probe.SetPrimary(ctx, "profile-primary-sentinel"); err != nil {
		t.Fatal(err)
	}
	if err := probe.SetCutBuffer(ctx, "profile-cut-sentinel"); err != nil {
		t.Fatal(err)
	}
	for _, selection := range []string{"CLIPBOARD", "PRIMARY"} {
		if owner, err := probe.Owner(ctx, selection); err != nil || owner == 0 {
			t.Fatalf("%s not owned before the handoff: %v %d", selection, err, owner)
		}
	}
	if exists, err := probe.CutBufferExists(ctx); err != nil || !exists {
		t.Fatalf("cut buffer not written before the handoff: %v %v", err, exists)
	}
	view, err := session.Handoff(b.home, one.ID, "agent")
	// A fresh human browser occasionally misses the native Exit menu, which the
	// product reports as a retryable close failure; retry that once.
	if err != nil && strings.Contains(err.Error(), "browser-close-needs-owner") {
		view, err = session.Handoff(b.home, one.ID, "agent")
	}
	if err != nil || view.BrowserMode != "agent" || view.State != "ready" {
		t.Fatalf("handoff to agent: %+v %v", view, err)
	}
	for _, selection := range []string{"CLIPBOARD", "PRIMARY"} {
		if owner, err := probe.Owner(ctx, selection); err != nil || owner != 0 {
			t.Fatalf("%s owned after the handoff: %v %d", selection, err, owner)
		}
	}
	if exists, err := probe.CutBufferExists(ctx); err != nil || exists {
		t.Fatalf("cut buffer survived the handoff: %v %v", err, exists)
	}
	if got, err := probe.Get(ctx); err != nil || got != "" {
		t.Fatalf("agent display holds clipboard text: %v %q", err, got)
	}
	if end, err := session.Stop(b.home, one.ID); err != nil || end.State != "stopped" {
		t.Fatalf("stop: %+v %v", end, err)
	}
	if found := filesHolding(t, b.profiles, privacy); len(found) != 0 {
		t.Fatalf("the clipboard sentinel reached the profile store: %v", found)
	}
	// A control: the scan does find text the store is known to hold.
	if found := filesHolding(t, b.profiles, filepath.Join(b.home, one.ID, "downloads")); len(found) == 0 {
		t.Fatal("the profile store scan missed the session's download directory in Preferences")
	}

	two := b.mustStart(t, "3m", "--browser-mode", "agent", "--agent-start-approved")
	next := enrollViewer(t, b.home, two.ID)
	if status, reply := next.clipboard(t, http.MethodGet, "", ""); status != 200 || reply["text"] != "" || reply["browser_mode"] != "agent" {
		t.Fatalf("next session's clipboard panel is not empty: %d %v", status, reply)
	}
	page := openTab(t, two.CDPAddress, fixture.URL+"/clip", "fixture-clip")
	cdpCall(t, page.WebSocketDebuggerURL, "Page.bringToFront", map[string]any{})
	sent := randomLabel(t, "next-session-send")
	if status, reply := next.clipboard(t, http.MethodPost, "?expected_mode=agent", sent); status != 200 {
		t.Fatalf("next session's panel send: %d %v", status, reply)
	}
	evaluate(t, page, "document.getElementById('paste').focus()")
	editCommand(t, page, "v", "paste")
	deadline := time.Now().Add(10 * time.Second)
	for evaluate(t, page, "document.getElementById('paste').value") != sent {
		if time.Now().After(deadline) {
			t.Fatal("the remote page could not read the text the panel sent")
		}
		time.Sleep(100 * time.Millisecond)
	}
	copied := randomLabel(t, "next-session-copy")
	evaluate(t, page, "(()=>{const e=document.getElementById('source');e.value="+strconv.Quote(copied)+";e.focus();e.select()})()")
	editCommand(t, page, "c", "copy")
	for {
		status, reply := next.clipboard(t, http.MethodGet, "", "")
		if status == 200 && reply["text"] == copied {
			break
		}
		if time.Now().After(deadline.Add(5 * time.Second)) {
			t.Fatalf("the panel did not read text copied in the remote page: %d %v", status, reply)
		}
		time.Sleep(100 * time.Millisecond)
	}
	if end, err := session.Stop(b.home, two.ID); err != nil || end.State != "stopped" {
		t.Fatalf("stop: %+v %v", end, err)
	}
	if found := filesHolding(t, b.profiles, privacy); len(found) != 0 {
		t.Fatalf("the clipboard sentinel reached the profile store: %v", found)
	}
}
