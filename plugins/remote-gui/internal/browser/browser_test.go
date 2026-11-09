package browser

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
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
