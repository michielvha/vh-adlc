package browser

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/session"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

func browserArgs(profile, marker, mode string, restore bool) []string {
	args := []string{
		"--user-data-dir=" + profile,
		"--no-first-run", "--no-default-browser-check",
		"--disable-search-engine-choice-screen", "--disable-default-apps",
		"--disable-background-networking", "--disable-component-update",
		"--disable-extensions", "--disable-sync",
		"--disable-features=OptimizationHints,MediaRouter,Translate,HttpsUpgrades,PaintHolding",
		"--password-store=basic", "--use-mock-keychain",
		"--disable-breakpad", "--disable-crash-reporter", "--disable-dev-shm-usage",
		"--disable-gpu", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
		"--ozone-platform=x11", "--window-position=0,0", "--window-size=1440,900",
	}
	if restore {
		args = append(args, "--restore-last-session")
	}
	if mode == "agent" {
		args = append(args, "--enable-automation", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0")
	}
	if marker != "" {
		args = append(args, marker)
	}
	return args
}

func validateBrowser(identity state.Identity, mode string) error {
	if !state.Alive(identity) {
		return errors.New("browser-process-identity-changed")
	}
	cmdline, err := os.ReadFile("/proc/" + strconv.Itoa(identity.PID) + "/cmdline")
	if err != nil {
		return errors.New("browser-launch-arguments-unavailable")
	}
	for _, arg := range strings.Split(string(cmdline), "\x00") {
		if strings.HasPrefix(arg, "--no-sandbox") || strings.HasPrefix(arg, "--disable-setuid-sandbox") || strings.HasPrefix(arg, "--enable-logging") || strings.HasPrefix(arg, "--log-net-log") || strings.Contains(arg, "AutomationControlled") {
			return errors.New("browser-launch-protection-unverified")
		}
		if mode == "human" && (strings.HasPrefix(arg, "--enable-automation") || strings.HasPrefix(arg, "--remote-debugging-")) {
			return errors.New("human-browser-has-automation-enabled")
		}
	}
	return nil
}

func (r *runtime) snapshot() session.BrowserHandle {
	handle := r.current
	handle.Owned = nil
	for _, process := range r.children {
		handle.Owned = append(handle.Owned, state.Process{Role: process.role, Identity: process.identity})
	}
	handle.Stop, handle.Handoff, handle.Alive = r.stop, r.handoff, r.healthy
	handle.Clipboard = r.clipboard()
	return handle
}

var (
	errClipboardBusy        = errors.New("clipboard-busy")
	errClipboardUnavailable = errors.New("clipboard-unavailable")
)

// clipboard serves the viewer's clipboard routes for this runtime.
type clipboard struct{ r *runtime }

func (r *runtime) clipboard() clipboard { return clipboard{r} }

// Set refuses a send while a switch is marked or when the owner saw another mode,
// so no send can land between the handoff's clear and the agent launch.
func (c clipboard) Set(ctx context.Context, text, expectedMode string) (string, error) {
	c.r.clipMu.Lock()
	defer c.r.clipMu.Unlock()
	mode := c.r.clipMode
	if c.r.clipSwitching || expectedMode != mode {
		return mode, errClipboardBusy
	}
	if c.r.clip == nil {
		return mode, errClipboardUnavailable
	}
	return mode, c.r.clip.Set(ctx, text)
}

func (c clipboard) Get(ctx context.Context) (string, string, error) {
	c.r.clipMu.Lock()
	defer c.r.clipMu.Unlock()
	if c.r.clip == nil {
		return "", c.r.clipMode, errClipboardUnavailable
	}
	text, err := c.r.clip.Get(ctx)
	return text, c.r.clipMode, err
}

func (c clipboard) Clear(ctx context.Context) (string, error) {
	c.r.clipMu.Lock()
	defer c.r.clipMu.Unlock()
	if c.r.clip == nil {
		return c.r.clipMode, errClipboardUnavailable
	}
	return c.r.clipMode, c.r.clip.Clear(ctx)
}

// endClipboardSwitch unmarks a switch. The clipboard then follows the browser
// that is running: the new one once a launch was attempted, otherwise the old mode.
func (r *runtime) endClipboardSwitch(original *child, mode string) {
	r.clipMu.Lock()
	defer r.clipMu.Unlock()
	r.clipSwitching = false
	if r.chrome != nil && r.chrome != original {
		r.clipMode = mode
	} else {
		r.clipMode = r.current.BrowserMode
	}
}

func (r *runtime) healthy() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.stopped {
		return false
	}
	for _, process := range r.children {
		if process.role == "browser" && !r.modeReady {
			continue
		}
		if !state.Alive(process.identity) {
			return false
		}
	}
	return true
}

func (r *runtime) persistBrowser() error {
	handle := r.snapshot()
	return r.save(func(record *state.Record) {
		record.Owned, record.CDPAddress = handle.Owned, handle.CDPAddress
	})
}

func (r *runtime) handoff(ctx context.Context, mode string) (session.BrowserHandle, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if mode != "human" && mode != "agent" {
		return r.snapshot(), errors.New("invalid-browser-mode")
	}
	record, err := state.Load(r.home, r.id)
	if err != nil || r.stopped || record.Kind != "browser" || !time.Now().Before(record.Expires) {
		return r.snapshot(), errors.New("browser-handoff-unavailable")
	}
	if r.chrome != nil {
		owned := slices.ContainsFunc(record.Owned, func(process state.Process) bool {
			return process.Role == "browser" && state.Equal(process.Identity, r.chrome.identity)
		})
		if !owned {
			return r.snapshot(), errors.New("browser-ownership-changed")
		}
	}
	if r.modeReady && r.current.BrowserMode == mode && r.alive() {
		return r.snapshot(), nil
	}
	r.clipMu.Lock()
	r.clipSwitching = true
	r.clipMu.Unlock()
	defer r.endClipboardSwitch(r.chrome, mode)
	// A later owner-completed close is expected after a failed transition.
	// Keep the viewer/profile available until retry, explicit stop or expiry.
	r.modeReady = false
	if r.chrome != nil {
		if state.Alive(r.chrome.identity) {
			if r.current.CDPAddress != "" {
				if err = r.focusMarker(ctx, r.current.CDPAddress); err != nil {
					return r.snapshot(), err
				}
			}
			if err = r.quitBrowser(ctx); err != nil {
				return r.snapshot(), err
			}
		}
		select {
		case <-r.chrome.done:
		case <-ctx.Done():
			return r.snapshot(), errors.New("browser-close-needs-owner")
		case <-time.After(8 * time.Second):
			return r.snapshot(), errors.New("browser-close-needs-owner")
		}
		r.children = slices.DeleteFunc(r.children, func(process *child) bool { return process == r.chrome })
		r.chrome = nil
	}
	r.modeReady = false
	r.current.CDPAddress = ""
	if err = r.persistBrowser(); err != nil {
		return r.snapshot(), err
	}
	if _, err = os.Lstat(filepath.Join(r.profile, "SingletonLock")); !os.IsNotExist(err) {
		return r.snapshot(), errors.New("browser-profile-still-locked")
	}
	// Text pasted for the human must not be left for the agent's browser.
	if mode == "agent" {
		if r.clip == nil {
			return r.snapshot(), errClipboardUnavailable
		}
		if err = r.clip.Clear(ctx); err != nil {
			return r.snapshot(), err
		}
	}
	handle, err := r.launch(ctx, mode)
	if err != nil {
		return r.snapshot(), err
	}
	return handle, nil
}

// Activate the restored connection tab so Chromium loads it before readiness or exit.
func (r *runtime) focusMarker(ctx context.Context, address string) error {
	if r.chrome == nil || !session.OwnsListener(address, r.chrome.identity) {
		return errors.New("browser-control-ownership-changed")
	}
	transport := &http.Transport{Proxy: nil}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address+"/json/list", nil)
	if err != nil {
		return errors.New("browser-page-list-unavailable")
	}
	reply, err := client.Do(req)
	if err != nil {
		return errors.New("browser-page-list-unavailable")
	}
	defer func() { _ = reply.Body.Close() }()
	var pages []struct {
		ID, Title, URL string
	}
	if reply.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(reply.Body, 1<<20)).Decode(&pages) != nil {
		return errors.New("invalid-browser-page-list")
	}
	for _, page := range pages {
		if page.URL != r.current.MarkerURL {
			continue
		}
		req, err = http.NewRequestWithContext(ctx, http.MethodGet, address+"/json/activate/"+page.ID, nil)
		if err != nil {
			return errors.New("browser-marker-activation-unavailable")
		}
		activated, err := client.Do(req)
		if err != nil {
			return errors.New("browser-marker-activation-unavailable")
		}
		_ = activated.Body.Close()
		if activated.StatusCode == http.StatusOK && page.Title == r.current.Marker && r.loaded.Load() {
			return nil
		}
		return errors.New("browser-marker-loading")
	}
	return errors.New("browser-marker-tab-missing")
}

// The connection page reports only probe booleans, never text typed by the owner.
func (r *runtime) serveMarker(w http.ResponseWriter, req *http.Request) {
	origin := strings.TrimSuffix(r.current.MarkerURL, "/")
	if "http://"+req.Host != origin {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if req.Method == http.MethodGet && req.URL.Path == "/check" {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"loaded": r.loaded.Load(), "automated": r.automated.Load(), "input_verified": r.inputChecked.Load()})
		return
	}
	if req.Method == http.MethodPost {
		generation := strconv.FormatUint(r.generation.Load(), 10)
		if req.Header.Get("Origin") != origin || req.URL.Query().Get("generation") != generation {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		switch req.URL.Path {
		case "/loaded":
			automated := req.URL.Query().Get("automated")
			if automated != "true" && automated != "false" {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			r.automated.Store(automated == "true")
			r.loaded.Store(true)
		case "/verified":
			r.inputChecked.Store(true)
		default:
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if req.Method != http.MethodGet || req.URL.Path != "/" {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	marker := r.current.Marker
	generation := strconv.FormatUint(r.generation.Load(), 10)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'")
	page := `<!doctype html><title>` + marker + `</title><h1>Shared browser ready</h1>
<p>Open your website in a new tab. Keep this connection tab open.</p>
<label>Connection check <input autofocus aria-label="Connection check"></label><script>
requestAnimationFrame(()=>requestAnimationFrame(()=>fetch('/loaded?generation=` + generation + `&automated='+navigator.webdriver,{method:'POST'})));
document.querySelector('input').addEventListener('input',event=>{
if(event.target.value===` + strconv.Quote(marker) + `)fetch('/verified?generation=` + generation + `',{method:'POST'});
});</script>`
	_, _ = io.WriteString(w, page)
}
