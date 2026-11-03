// Package session owns detached, bounded-lifetime remote-gui sessions.
package session

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

type View struct {
	SchemaVersion   int       `json:"schema_version"`
	ID              string    `json:"id"`
	Kind            string    `json:"kind"`
	State           string    `json:"state"`
	URL             string    `json:"url,omitempty"`
	Expires         time.Time `json:"expires_at"`
	Diagnostic      string    `json:"diagnostic,omitempty"`
	ReadinessScope  string    `json:"readiness_scope,omitempty"`
	AppVerification string    `json:"app_verification,omitempty"`
	CDPAddress      string    `json:"local_cdp,omitempty"`
	Marker          string    `json:"marker,omitempty"`
	AccessCode      string    `json:"access_code,omitempty"`
}
type BrowserHandle struct {
	Target     string
	CDPAddress string
	Marker     string
	Password   string
	Owned      []state.Process
	Stop       func()
}

var BrowserLauncher func(context.Context, config.Config, string) (BrowserHandle, error)

func view(r state.Record, revealURL bool) View {
	v := View{SchemaVersion: 1, ID: r.ID, Kind: r.Kind, State: r.State, Expires: r.Expires, Diagnostic: r.Diagnostic, CDPAddress: r.CDPAddress, Marker: r.Marker}
	if r.State == "ready" {
		v.ReadinessScope = "host-transport-only"
		v.AppVerification = "not-attested"
		v.URL = r.Origin
		if r.Kind == "browser" {
			v.URL += "/vnc.html"
		} else if u, e := url.Parse(r.Config.Target); e == nil {
			v.URL += u.EscapedPath()
			if revealURL && u.RawQuery != "" {
				v.URL += "?" + u.RawQuery
			}
		}
	}
	return v
}

func Read(home, id string) (View, error) {
	r, err := state.Load(home, id)
	if err != nil {
		return View{}, err
	}
	v := view(r, false)
	if (r.State == "starting" || r.State == "ready" || r.State == "stopping") && !state.Alive(r.Guard) && !state.Alive(r.Supervisor) {
		v.State = "cleanup-pending"
		v.URL = ""
		v.Diagnostic = "controllers-unavailable; run cleanup"
		return v, nil
	}
	if r.State == "ready" && (!state.Alive(r.Guard) || !state.Alive(r.Supervisor) || !time.Now().Before(r.Expires)) {
		v.State = "stopping"
		v.URL = ""
		v.Diagnostic = "controller-or-lifetime-check-pending"
	}
	return v, nil
}

func List(home string) ([]View, error) {
	ids, err := state.IDs(home)
	if err != nil {
		return nil, err
	}
	var views []View
	for _, id := range ids {
		v, err := Read(home, id)
		if err != nil {
			return nil, err
		}
		views = append(views, v)
	}
	return views, nil
}

func Start(c config.Config) (View, error) {
	if len(filepath.Join(c.Home, strings.Repeat("0", 32), "control.sock")) > 103 {
		return View{}, errors.New("state path too long; select a shorter absolute REMOTE_GUI_HOME")
	}
	var owner state.Identity
	var inode string
	var err error
	if c.Kind == "share" {
		owner, inode, err = discover(c.Target)
		if err != nil {
			return View{}, err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		err = rejectControl(ctx, c.Target)
		cancel()
		if err != nil {
			return View{}, err
		}
	} else if BrowserLauncher == nil {
		return View{}, errors.New("browser runtime is not configured")
	}
	id, err := state.New(c.Home)
	if err != nil {
		return View{}, err
	}
	r := state.Record{Version: 1, ID: id, Kind: c.Kind, State: "starting", Config: c, Created: time.Now().UTC(), Expires: time.Now().UTC().Add(c.TTL), Upstream: owner, UpstreamSocket: inode}
	if err = state.Save(c.Home, r); err != nil {
		_ = os.RemoveAll(filepath.Join(c.Home, id))
		return View{}, err
	}
	executable, err := os.Executable()
	if err != nil {
		return View{}, errors.New("session executable unavailable")
	}
	cmd := exec.Command(executable, "_guard", c.Home, id)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	if err = cmd.Start(); err != nil {
		r.State = "failed"
		r.Diagnostic = "lifetime-guard-start-failed"
		_ = state.Save(c.Home, r)
		return View{}, errors.New(r.Diagnostic)
	}
	r.Guard, err = state.Inspect(cmd.Process.Pid)
	if err == nil {
		err = state.Save(c.Home, r)
	}
	_ = cmd.Process.Release()
	if err != nil {
		return View{}, errors.New("cannot-record-lifetime-guard")
	}
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		r, err = state.Load(c.Home, id)
		if err == nil {
			switch r.State {
			case "ready":
				return view(r, false), nil
			case "failed", "cleanup-pending", "stopped":
				return view(r, false), errors.New("session-start-failed: " + r.Diagnostic)
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	_, _ = Stop(c.Home, id)
	return View{}, errors.New("session-start-timed-out; cleanup requested")
}

func rejectControl(ctx context.Context, target string) error {
	u, err := url.Parse(target)
	if err != nil {
		return errors.New("invalid-upstream")
	}
	u.Path = "/json/version"
	u.RawPath = ""
	u.RawQuery = ""
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return errors.New("invalid-upstream")
	}
	client := &http.Client{Transport: &http.Transport{Proxy: nil}, Timeout: 3 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		return errors.New("upstream-probe-failed")
	}
	defer func() { _ = resp.Body.Close() }()
	var body struct {
		WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
	}
	if json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&body) == nil && body.WebSocketDebuggerURL != "" {
		return errors.New("browser-control-endpoints-cannot-be-shared")
	}
	return nil
}

func control(home, id, route string, into any) error {
	if !config.ValidID(id) {
		return errors.New("invalid-session-id")
	}
	socket := filepath.Join(home, id, "control.sock")
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{Timeout: time.Second}).DialContext(ctx, "unix", socket)
	}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 3 * time.Second}
	req, err := http.NewRequest(http.MethodPost, "http://unix/"+route, nil)
	if err != nil {
		return errors.New("invalid-control-request")
	}
	resp, err := client.Do(req)
	if err != nil {
		return errors.New("session-control-unavailable")
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != 200 {
		return errors.New("session-not-ready-or-stopped")
	}
	if into == nil {
		return nil
	}
	if err = json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(into); err != nil {
		return errors.New("invalid-session-control-response")
	}
	return nil
}

func Access(home, id string, reveal bool) (View, error) {
	v, err := Read(home, id)
	if err != nil || !reveal {
		return v, err
	}
	if v.State != "ready" {
		return v, errors.New("session-not-ready-or-stopped")
	}
	err = control(home, id, "access", &v)
	return v, err
}

func Stop(home, id string) (View, error) {
	if !config.ValidID(id) {
		return View{}, errors.New("invalid-session-id")
	}
	if _, err := os.Lstat(filepath.Join(home, id)); os.IsNotExist(err) {
		return View{SchemaVersion: 1, ID: id, State: "missing"}, nil
	}
	r, err := state.Load(home, id)
	if err != nil {
		return View{}, err
	}
	if r.State == "stopped" || r.State == "failed" {
		return view(r, false), nil
	}
	if err = control(home, id, "stop", nil); err != nil {
		switch {
		case state.Alive(r.Guard):
			_ = state.Signal(r.Guard, syscall.SIGTERM)
		case state.Alive(r.Supervisor):
			_ = state.Signal(r.Supervisor, syscall.SIGTERM)
		default:
			_, err = Cleanup(context.Background(), home)
			if err != nil {
				return View{}, err
			}
		}
	}
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		r, err = state.Load(home, id)
		if err != nil {
			return View{}, err
		}
		if r.State == "stopped" || r.State == "failed" || r.State == "cleanup-pending" {
			return view(r, false), nil
		}
		time.Sleep(20 * time.Millisecond)
	}
	return View{}, errors.New("session-cleanup-pending")
}

func Internal(args []string) (bool, int) {
	if len(args) == 0 || (args[0] != "_guard" && args[0] != "_supervise") {
		return false, 0
	}
	if len(args) != 3 || !filepath.IsAbs(args[1]) || !config.ValidID(args[2]) {
		return true, 2
	}
	if args[0] == "_guard" {
		return true, guard(args[1], args[2])
	}
	return true, supervise(args[1], args[2])
}
