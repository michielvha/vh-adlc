// Package browser starts only a fresh task-owned headed Chromium display.
package browser

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/app"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/profile"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/session"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

type child struct {
	role     string
	identity state.Identity
	done     chan struct{}
}
type runtime struct {
	mu           sync.Mutex
	current      session.BrowserHandle
	profile      string
	downloads    string
	reusable     bool
	env          []string
	vncAddress   string
	chrome       *child
	modeReady    bool
	stopped      bool
	generation   atomic.Uint64
	loaded       atomic.Bool
	automated    atomic.Bool
	inputChecked atomic.Bool
	markerServer *http.Server
	home, id     string
	children     []*child
	display      *state.Display
	once         sync.Once
	cleanupErr   error
}

func chooseDisplay(start int) (int, error) {
	for n := start; n < start+512 && n <= 65000; n++ {
		lock, socket := state.DisplayPaths(n)
		_, a := os.Lstat(lock)
		_, b := os.Lstat(socket)
		if os.IsNotExist(a) && os.IsNotExist(b) {
			return n, nil
		}
	}
	return 0, errors.New("no-unused-display-available")
}

func randomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return nil, errors.New("browser-randomness-unavailable")
	}
	return b, nil
}

func (r *runtime) save(fn func(*state.Record)) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return state.Update(ctx, r.home, r.id, fn)
}

func (r *runtime) allocateDisplay(ctx context.Context) (int, error) {
	release, err := state.Lock(ctx, r.home)
	if err != nil {
		return 0, err
	}
	defer release()
	ids, err := state.IDs(r.home)
	if err != nil {
		return 0, err
	}
	busy := make(map[int]bool)
	for _, id := range ids {
		record, e := state.Load(r.home, id)
		if e != nil {
			return 0, errors.New("display-reservation-state-unreadable")
		}
		if record.Display != nil {
			busy[record.Display.Number] = true
		}
	}
	random, err := randomBytes(2)
	if err != nil {
		return 0, err
	}
	start := 100 + (int(random[0])*256+int(random[1]))%5000
	for range 64 {
		number, e := chooseDisplay(start)
		if e != nil {
			return 0, e
		}
		if busy[number] {
			start = number + 1
			continue
		}
		record, e := state.Load(r.home, r.id)
		if e != nil {
			return 0, e
		}
		record.Display = &state.Display{Number: number}
		if e = state.Save(r.home, record); e != nil {
			return 0, e
		}
		r.display = record.Display
		return number, nil
	}
	return 0, errors.New("display-reservations-exhausted")
}

func cleanEnv(display, auth string) []string {
	var out []string
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		switch key {
		case "DISPLAY", "XAUTHORITY", "CHROME_LOG_FILE", "CHROMIUM_FLAGS", "CHROME_FLAGS", "CHROMIUM_USER_FLAGS":
			continue
		}
		out = append(out, entry)
	}
	return append(out, "DISPLAY="+display, "XAUTHORITY="+auth)
}

func (r *runtime) spawn(role, binary string, args, env []string) (*child, error) {
	cmd := exec.Command(binary, args...)
	cmd.Env = env
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.SysProcAttr = &syscall.SysProcAttr{}
	if err := cmd.Start(); err != nil {
		return nil, errors.New(role + "-start-failed")
	}
	id, err := state.Inspect(cmd.Process.Pid)
	if err != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return nil, errors.New(role + "-identity-unavailable")
	}
	c := &child{role: role, identity: id, done: make(chan struct{})}
	r.children = append(r.children, c)
	go func() { _ = cmd.Wait(); close(c.done) }()
	if err = r.save(func(record *state.Record) {
		record.Owned = append(record.Owned, state.Process{Role: role, Identity: id})
	}); err != nil {
		_ = state.Signal(id, syscall.SIGTERM)
		return nil, err
	}
	return c, nil
}

func (r *runtime) alive() bool {
	for _, c := range r.children {
		if !state.Alive(c.identity) {
			return false
		}
	}
	return true
}

func (r *runtime) wait(ctx context.Context, stage string, check func() bool) error {
	for {
		if !r.alive() {
			return errors.New("browser-" + stage + "-component-exited")
		}
		if check() {
			return nil
		}
		select {
		case <-ctx.Done():
			return errors.New("browser-" + stage + "-startup-timed-out")
		case <-time.After(25 * time.Millisecond):
		}
	}
}

func runInput(ctx context.Context, binary string, args []string, input string, env []string) error {
	bounded, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	cmd := exec.CommandContext(bounded, binary, args...)
	cmd.Env = env
	cmd.Stdin = strings.NewReader(input)
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Run(); err != nil {
		return errors.New("browser-authentication-setup-failed")
	}
	return nil
}

func freePort() (string, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", errors.New("browser-port-allocation-failed")
	}
	address := listener.Addr().String()
	_ = listener.Close()
	return address, nil
}

func (r *runtime) stop() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.once.Do(func() {
		r.stopped = true
		if r.markerServer != nil {
			_ = r.markerServer.Close()
		}
		if r.reusable && r.chrome != nil && state.Alive(r.chrome.identity) {
			r.closeReusable()
		}
		for i := len(r.children) - 1; i >= 0; i-- {
			_ = state.Signal(r.children[i].identity, syscall.SIGTERM)
		}
		deadline := time.Now().Add(3 * time.Second)
		for time.Now().Before(deadline) {
			live := false
			for _, c := range r.children {
				live = live || state.Alive(c.identity)
			}
			if !live {
				break
			}
			time.Sleep(20 * time.Millisecond)
		}
		for _, c := range r.children {
			if state.Alive(c.identity) {
				_ = state.Signal(c.identity, syscall.SIGKILL)
			}
			select {
			case <-c.done:
			case <-time.After(time.Second):
				r.cleanupErr = errors.New(c.role + "-cleanup-pending")
			}
		}
		if r.cleanupErr == nil {
			r.cleanupErr = state.ReleaseDisplay(r.display)
		}
		if r.cleanupErr == nil {
			for _, name := range []string{"profile", "downloads", "Xauthority", "vnc.passwd"} {
				if err := os.RemoveAll(filepath.Join(r.home, r.id, name)); err != nil {
					r.cleanupErr = errors.New("browser-private-cleanup-pending")
				}
			}
		}
		_ = r.save(func(record *state.Record) {
			if r.cleanupErr == nil {
				record.Display = nil
			} else {
				record.State = "cleanup-pending"
				record.Diagnostic = r.cleanupErr.Error()
			}
		})
	})
}

// closeReusable ends Chromium on a reusable profile before the display stops,
// without sending any key: SIGTERM to Chromium alone, SIGKILL after two
// seconds if it is still running. The handoff keeps its keyboard Exit.
func (r *runtime) closeReusable() {
	chrome := r.chrome
	for _, step := range []struct {
		signal syscall.Signal
		wait   time.Duration
	}{{syscall.SIGTERM, 2 * time.Second}, {syscall.SIGKILL, time.Second}} {
		if !state.Alive(chrome.identity) {
			return
		}
		_ = state.Signal(chrome.identity, step.signal)
		select {
		case <-chrome.done:
			return
		case <-time.After(step.wait):
		}
	}
}

func Start(ctx context.Context, c config.Config, id string) (session.BrowserHandle, error) {
	var empty session.BrowserHandle
	if err := syscall.Setrlimit(syscall.RLIMIT_CORE, &syscall.Rlimit{Cur: 0, Max: 0}); err != nil {
		return empty, errors.New("cannot-disable-browser-core-dumps")
	}
	if app.Doctor(c).Result != "ready" {
		return empty, errors.New("browser-dependencies-unavailable; run doctor")
	}
	record, err := state.Load(c.Home, id)
	if err != nil || record.Kind != "browser" {
		return empty, errors.New("browser-session-record-unavailable")
	}
	for range 3 {
		r := &runtime{home: c.Home, id: id}
		handle, e := r.start(ctx, c)
		if e == nil {
			handle.Stop = r.stop
			return handle, nil
		}
		r.stop()
		if r.cleanupErr != nil {
			return empty, errors.New(e.Error() + "; " + r.cleanupErr.Error())
		}
		err = e
		if ctx.Err() != nil {
			break
		}
	}
	return empty, err
}

// prepare selects the Chromium user data directory. A reusable profile lives
// in the profile store and is kept; otherwise a fresh disposable profile is
// created in the session directory. Downloads are always per session.
func (r *runtime) prepare(c config.Config) error {
	directory := filepath.Join(c.Home, r.id)
	r.downloads = filepath.Join(directory, "downloads")
	if c.Profile != "" {
		r.reusable = true
		r.profile = filepath.Join(c.ProfileHome, c.Profile, "chromium")
		if err := state.Private(r.profile, 0o700); err != nil {
			return errors.New("reusable-browser-profile-unavailable")
		}
		if err := os.Mkdir(r.downloads, 0o700); err != nil {
			return errors.New("browser-download-directory-unavailable")
		}
		return nil
	}
	r.profile = filepath.Join(directory, "profile")
	if err := os.Mkdir(r.profile, 0o700); err != nil {
		return errors.New("fresh-browser-profile-unavailable")
	}
	if err := os.Mkdir(r.downloads, 0o700); err != nil {
		return errors.New("browser-download-directory-unavailable")
	}
	if err := os.Mkdir(filepath.Join(r.profile, "Default"), 0o700); err != nil {
		return errors.New("browser-preferences-unavailable")
	}
	preferences, _ := json.Marshal(map[string]any{"download": map[string]any{"default_directory": r.downloads, "prompt_for_download": false}, "credentials_enable_service": false, "profile": map[string]any{"password_manager_enabled": false}, "session": map[string]any{"restore_on_startup": 1}})
	if err := os.WriteFile(filepath.Join(r.profile, "Default", "Preferences"), preferences, 0o600); err != nil {
		return errors.New("browser-preferences-unavailable")
	}
	return nil
}

func (r *runtime) start(ctx context.Context, c config.Config) (session.BrowserHandle, error) {
	var empty session.BrowserHandle
	directory := filepath.Join(c.Home, r.id)
	auth := filepath.Join(directory, "Xauthority")
	passwordFile := filepath.Join(directory, "vnc.passwd")
	if err := r.prepare(c); err != nil {
		return empty, err
	}
	if err := os.WriteFile(auth, nil, 0o600); err != nil {
		return empty, errors.New("private-x-authority-unavailable")
	}
	number, err := r.allocateDisplay(ctx)
	if err != nil {
		return empty, err
	}
	display := ":" + strconv.Itoa(number)
	env := cleanEnv(display, auth)
	cookie, err := randomBytes(16)
	if err != nil {
		return empty, err
	}
	if err = runInput(ctx, app.Tool("REMOTE_GUI_XAUTH", "xauth"), []string{"-f", auth}, "add "+display+" . "+hex.EncodeToString(cookie)+"\n", env); err != nil {
		return empty, err
	}
	x, err := r.spawn("display", app.Tool("REMOTE_GUI_XVFB", "Xvfb"), []string{display, "-screen", "0", "1440x900x24", "-nolisten", "tcp", "-auth", auth}, env)
	if err != nil {
		return empty, err
	}
	r.display.Owner = x.identity
	if err = r.save(func(record *state.Record) { record.Display = r.display }); err != nil {
		return empty, err
	}
	_, socket := state.DisplayPaths(number)
	if err = r.wait(ctx, "display", func() bool { return session.OwnsUnixListener(socket, x.identity) }); err != nil {
		return empty, err
	}
	lease, err := state.CaptureDisplay(number, x.identity)
	if err != nil {
		return empty, err
	}
	r.display = lease
	if err = r.save(func(record *state.Record) { record.Display = lease }); err != nil {
		return empty, err
	}
	secret, err := randomBytes(6)
	if err != nil {
		return empty, err
	}
	password := base64.RawURLEncoding.EncodeToString(secret)
	if err = runInput(ctx, app.Tool("REMOTE_GUI_X11VNC", "x11vnc"), []string{"-storepasswd", passwordFile}, password+"\n"+password+"\ny\n", env); err != nil {
		return empty, err
	}
	if err = os.Chmod(passwordFile, 0o600); err != nil {
		return empty, errors.New("private-vnc-credential-unavailable")
	}
	vncAddress, err := freePort()
	if err != nil {
		return empty, err
	}
	_, vncPort, _ := net.SplitHostPort(vncAddress)
	vnc, err := r.spawn("vnc", app.Tool("REMOTE_GUI_X11VNC", "x11vnc"), []string{"-display", display, "-localhost", "-rfbport", vncPort, "-rfbauth", passwordFile, "-forever", "-shared", "-noxdamage", "-quiet"}, env)
	if err != nil {
		return empty, err
	}
	if err = r.wait(ctx, "vnc", func() bool { return session.OwnsListener("http://"+vncAddress, vnc.identity) }); err != nil {
		return empty, err
	}
	bridgeAddress, err := freePort()
	if err != nil {
		return empty, err
	}
	bridge, err := r.spawn("viewer-bridge", app.Tool("REMOTE_GUI_WEBSOCKIFY", "websockify"), []string{bridgeAddress, vncAddress}, env)
	if err != nil {
		return empty, err
	}
	if err = r.wait(ctx, "viewer-bridge", func() bool { return session.OwnsListener("http://"+bridgeAddress, bridge.identity) }); err != nil {
		return empty, err
	}
	nonce, err := randomBytes(16)
	if err != nil {
		return empty, err
	}
	marker := "remote-gui-" + hex.EncodeToString(nonce)
	markerListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return empty, errors.New("browser-marker-listener-unavailable")
	}
	initial := "http://" + markerListener.Addr().String() + "/"
	r.current = session.BrowserHandle{Target: "http://" + bridgeAddress + "/vnc.html", Marker: marker, MarkerURL: initial, Password: password, Assets: app.Tool("REMOTE_GUI_NOVNC", "/usr/share/novnc")}
	r.env, r.vncAddress = env, vncAddress
	r.markerServer = &http.Server{ReadHeaderTimeout: 3 * time.Second, WriteTimeout: 3 * time.Second, Handler: http.HandlerFunc(r.serveMarker)}
	go func() { _ = r.markerServer.Serve(markerListener) }()
	return r.launch(ctx, c.Mode())
}

// prepareLaunch returns Chromium's arguments for one launch. A reusable
// profile's first launch in a session opens only the connection page and marks
// the previous exit clean, so tabs and session-only cookies from an earlier
// session never return; later handoff launches restore the last session.
func (r *runtime) prepareLaunch(mode string, generation uint64) ([]string, error) {
	initialURL := ""
	if generation == 1 {
		initialURL = r.current.MarkerURL
	}
	restore := true
	if r.reusable {
		first := generation == 1
		if err := profile.MergePreferences(r.profile, r.downloads, first); err != nil {
			return nil, err
		}
		restore = !first
	}
	return browserArgs(r.profile, initialURL, mode, restore), nil
}

func (r *runtime) launch(ctx context.Context, mode string) (session.BrowserHandle, error) {
	var empty session.BrowserHandle
	generation := r.generation.Add(1)
	r.loaded.Store(false)
	r.modeReady = false
	r.current.CDPAddress = ""
	if err := os.Remove(filepath.Join(r.profile, "DevToolsActivePort")); err != nil && !os.IsNotExist(err) {
		return empty, errors.New("stale-browser-control-file-unavailable")
	}
	args, err := r.prepareLaunch(mode, generation)
	if err != nil {
		return empty, err
	}
	chrome, err := r.spawn("browser", app.Tool("REMOTE_GUI_CHROMIUM", "chromium-browser"), args, r.env)
	if err != nil {
		return empty, err
	}
	r.chrome = chrome
	if mode == "human" {
		if err = r.wait(ctx, "human-page", func() bool {
			return r.loaded.Load() && !r.automated.Load() && validateBrowser(chrome.identity, mode) == nil
		}); err != nil {
			return empty, err
		}
		r.current.BrowserMode, r.modeReady = mode, true
		return r.snapshot(), nil
	}
	var cdp string
	cdpReason := "active-port-file-unavailable"
	if err = r.wait(ctx, "cdp", func() bool {
		name := filepath.Join(r.profile, "DevToolsActivePort")
		info, e := os.Lstat(name)
		if e != nil || !info.Mode().IsRegular() {
			return false
		}
		if e = os.Chmod(name, 0o600); e != nil {
			return false
		}
		data, e := os.ReadFile(name)
		if e != nil || len(data) > 512 {
			return false
		}
		fields := strings.Fields(string(data))
		if len(fields) == 0 {
			return false
		}
		port, e := strconv.Atoi(fields[0])
		if e != nil || port < 1 || port > 65535 {
			return false
		}
		address := "http://127.0.0.1:" + strconv.Itoa(port)
		if !session.OwnsListener(address, chrome.identity) {
			cdpReason = "listener-ownership-unverified"
			return false
		}
		if validateBrowser(chrome.identity, mode) != nil {
			cdpReason = "browser-launch-protection-unverified"
			return false
		}
		if e := r.focusMarker(ctx, address); e != nil {
			cdpReason = e.Error()
		} else {
			cdp = address
			return true
		}
		return false
	}); err != nil {
		return empty, errors.New(err.Error() + ": " + cdpReason)
	}
	r.current.CDPAddress, r.current.BrowserMode, r.modeReady = cdp, mode, true
	return r.snapshot(), nil
}
