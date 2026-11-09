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

func browserArgs(profile, marker, mode string) []string {
	args := []string{
		"--user-data-dir=" + profile,
		"--no-first-run", "--no-default-browser-check", "--restore-last-session",
		"--disable-search-engine-choice-screen", "--disable-default-apps",
		"--disable-background-networking", "--disable-component-update",
		"--disable-extensions", "--disable-sync",
		"--disable-features=OptimizationHints,MediaRouter,Translate,HttpsUpgrades,PaintHolding",
		"--password-store=basic", "--use-mock-keychain",
		"--disable-breakpad", "--disable-crash-reporter", "--disable-dev-shm-usage",
		"--disable-gpu", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
		"--ozone-platform=x11", "--window-position=0,0", "--window-size=1440,900",
	}
	if mode == "agent" {
		args = append(args, "--enable-automation", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0")
	}
	return append(args, marker)
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
	return handle
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
	// A later owner-completed close is expected after a failed transition.
	// Keep the viewer/profile available until retry, explicit stop or expiry.
	r.modeReady = false
	r.current.CDPAddress = ""
	if r.chrome != nil {
		if state.Alive(r.chrome.identity) {
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
	handle, err := r.launch(ctx, mode)
	if err != nil {
		return r.snapshot(), err
	}
	return handle, nil
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
	page := `<!doctype html><title>` + marker + `</title><h1>Shared browser ready</h1><label>Connection check <input autofocus aria-label="Connection check"></label><script>
requestAnimationFrame(()=>requestAnimationFrame(()=>fetch('/loaded?generation=` + generation + `&automated='+navigator.webdriver,{method:'POST'})));
document.querySelector('input').addEventListener('input',event=>{
if(event.target.value===` + strconv.Quote(marker) + `)fetch('/verified?generation=` + generation + `',{method:'POST'});
});</script>`
	_, _ = io.WriteString(w, page)
}
