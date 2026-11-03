package session

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/proxy"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/tailnet"
)

func update(home, id string, fn func(*state.Record)) error {
	ctx, cancel := context.WithTimeout(context.Background(), 7*time.Second)
	defer cancel()
	return state.Update(ctx, home, id, fn)
}

func awaitRole(ctx context.Context, home, id, role string) (state.Record, error) {
	self, err := state.Inspect(os.Getpid())
	if err != nil {
		return state.Record{}, err
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		r, e := state.Load(home, id)
		if e == nil {
			owned := r.Guard
			if role == "supervisor" {
				owned = r.Supervisor
			}
			if state.Equal(owned, self) {
				return r, nil
			}
			if owned.PID != 0 {
				return r, errors.New("daemon-ownership-mismatch")
			}
		}
		select {
		case <-ctx.Done():
			return state.Record{}, ctx.Err()
		case <-time.After(10 * time.Millisecond):
		}
	}
	return state.Record{}, errors.New("daemon-ownership-record-unavailable")
}

func groupMembers(r state.Record) ([]state.Identity, error) {
	self, err := state.Inspect(os.Getpid())
	if err != nil {
		return nil, err
	}
	if !state.Equal(self, r.Guard) && !state.Equal(self, r.Supervisor) {
		return nil, errors.New("controller-ownership-changed")
	}
	if self.Group != r.Guard.Group || self.Session != r.Guard.Session || r.Guard.Group != r.Guard.PID || r.Guard.Session != r.Guard.PID {
		return nil, errors.New("private-process-group-not-owned")
	}
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, errors.New("owned-process-list-unavailable")
	}
	var members []state.Identity
	for _, e := range entries {
		pid, err := strconv.Atoi(e.Name())
		if err != nil || pid == os.Getpid() {
			continue
		}
		id, err := state.Inspect(pid)
		if err == nil && id.Group == self.Group && id.Session == self.Session {
			members = append(members, id)
		}
	}
	return members, nil
}

func stopMembers(r state.Record) error {
	members, err := groupMembers(r)
	if err != nil {
		return err
	}
	for _, id := range members {
		_ = state.Signal(id, syscall.SIGTERM)
	}
	for range 12 {
		members, err = groupMembers(r)
		if err != nil {
			return err
		}
		if len(members) == 0 {
			return nil
		}
		time.Sleep(25 * time.Millisecond)
	}
	for _, id := range members {
		_ = state.Signal(id, syscall.SIGKILL)
	}
	for range 20 {
		members, err = groupMembers(r)
		if err != nil {
			return err
		}
		if len(members) == 0 {
			return nil
		}
		time.Sleep(25 * time.Millisecond)
	}
	return errors.New("owned-process-cleanup-pending")
}

func removeForward(home, id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	release, err := state.Lock(ctx, home)
	if err != nil {
		return err
	}
	defer release()
	r, err := state.Load(home, id)
	if err != nil {
		return err
	}
	if r.Forward != nil {
		client := tailnet.New(os.Getenv("REMOTE_GUI_TAILSCALE_SOCKET"))
		if err = client.Remove(ctx, r.Forward); err != nil {
			return err
		}
		r.Forward = nil
		return state.Save(home, r)
	}
	return nil
}

func privateCleanup(home, id string) error {
	for _, name := range []string{"profile", "downloads", "Xauthority", "vnc.passwd", "control.sock"} {
		if err := os.RemoveAll(filepath.Join(home, id, name)); err != nil {
			return errors.New("private-resource-cleanup-pending")
		}
	}
	return nil
}

func finish(home, id string, controller bool) error {
	r, err := state.Load(home, id)
	if err != nil {
		return err
	}
	if controller {
		if err = stopMembers(r); err != nil {
			return err
		}
	} else {
		for _, p := range append(append([]state.Process{}, r.Owned...), state.Process{Role: "supervisor", Identity: r.Supervisor}) {
			if self, e := state.Inspect(os.Getpid()); e == nil && p.Identity.Boot != self.Boot {
				continue
			}
			if p.Identity.PID == 0 {
				continue
			}
			current, e := state.Inspect(p.Identity.PID)
			if e == nil && !state.Equal(current, p.Identity) {
				return errors.New("recorded-process-identity-changed")
			}
			if state.Alive(p.Identity) {
				_ = state.Signal(p.Identity, syscall.SIGTERM)
				time.Sleep(30 * time.Millisecond)
				if state.Alive(p.Identity) {
					return errors.New("owned-process-cleanup-pending")
				}
			}
		}
	}
	if err = removeForward(home, id); err != nil {
		return err
	}
	if err = state.ReleaseDisplay(r.Display); err != nil {
		return err
	}
	if err = privateCleanup(home, id); err != nil {
		return err
	}
	return update(home, id, func(r *state.Record) {
		if r.Diagnostic == "" {
			r.State = "stopped"
		} else {
			r.State = "failed"
		}
		r.Origin = ""
		r.ProxyAddress = ""
		r.CDPAddress = ""
		r.Marker = ""
		r.Display = nil
		r.Config.Target = redactedTarget(r.Config.Target)
	})
}

func redactedTarget(raw string) string {
	for i, c := range raw {
		if c == '?' {
			return raw[:i]
		}
	}
	return raw
}

func markPending(home, id string, err error) {
	_ = update(home, id, func(r *state.Record) { r.State = "cleanup-pending"; r.Diagnostic = err.Error() })
}

func guard(home, id string) int {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer cancel()
	r, err := awaitRole(ctx, home, id, "guard")
	if err != nil {
		return 1
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		_ = update(home, id, func(r *state.Record) { r.State = "failed"; r.Diagnostic = "proxy-listener-unavailable" })
		return 1
	}
	defer func() { _ = listener.Close() }()
	if err = update(home, id, func(r *state.Record) { r.ProxyAddress = listener.Addr().String() }); err != nil {
		return 1
	}
	file, err := listener.(*net.TCPListener).File()
	if err != nil {
		return 1
	}
	executable, err := os.Executable()
	if err != nil {
		_ = file.Close()
		return 1
	}
	cmd := exec.Command(executable, "_supervise", home, id)
	cmd.ExtraFiles = []*os.File{file}
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err = cmd.Start(); err != nil {
		_ = file.Close()
		_ = update(home, id, func(r *state.Record) { r.State = "failed"; r.Diagnostic = "supervisor-start-failed" })
		return 1
	}
	_ = file.Close()
	sup, err := state.Inspect(cmd.Process.Pid)
	if err != nil {
		return 1
	}
	if err = update(home, id, func(r *state.Record) { r.Supervisor = sup }); err != nil {
		_ = state.Signal(sup, syscall.SIGTERM)
		return 1
	}
	wait := make(chan bool, 1)
	go func() { wait <- (cmd.Wait() == nil) }()
	timer := time.NewTimer(time.Until(r.Expires))
	defer timer.Stop()
	select {
	case clean := <-wait:
		if !clean {
			_ = update(home, id, func(r *state.Record) {
				if r.Diagnostic == "" {
					r.Diagnostic = "supervisor-exited"
				}
			})
		}
	case <-ctx.Done():
		_ = state.Signal(sup, syscall.SIGTERM)
		select {
		case <-wait:
		case <-time.After(5 * time.Second):
			_ = state.Signal(sup, syscall.SIGKILL)
			<-wait
		}
	case <-timer.C:
		_ = state.Signal(sup, syscall.SIGTERM)
		select {
		case <-wait:
		case <-time.After(5 * time.Second):
			_ = state.Signal(sup, syscall.SIGKILL)
			<-wait
		}
	}
	if err = finish(home, id, true); err == nil {
		return 0
	}
	markPending(home, id, err)
	// The guard keeps the reserved listener alive and denies access while a scoped
	// forward cannot be removed, so an unrelated process cannot reuse its target.
	denied := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "session cleanup pending", http.StatusGone)
	}), ReadHeaderTimeout: 3 * time.Second, WriteTimeout: 3 * time.Second}
	go func() { _ = denied.Serve(listener) }()
	defer func() { _ = denied.Close() }()
	trigger := make(chan struct{}, 1)
	socket := filepath.Join(home, id, "control.sock")
	_ = os.Remove(socket)
	controlListener, e := net.Listen("unix", socket)
	if e != nil {
		return 1
	}
	_ = os.Chmod(socket, 0o600)
	defer func() { _ = controlListener.Close() }()
	controlServer := &http.Server{ReadHeaderTimeout: 2 * time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodPost || (req.URL.Path != "/stop" && req.URL.Path != "/cleanup") {
			http.NotFound(w, req)
			return
		}
		select {
		case trigger <- struct{}{}:
		default:
		}
		w.WriteHeader(200)
	})}
	go func() { _ = controlServer.Serve(controlListener) }()
	defer func() { _ = controlServer.Close() }()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-trigger:
		case <-ticker.C:
		}
		if err = finish(home, id, true); err == nil {
			return 0
		}
		markPending(home, id, err)
	}
}

func supervise(home, id string) int {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer cancel()
	r, err := awaitRole(ctx, home, id, "supervisor")
	if err != nil {
		return 1
	}
	err = serve(ctx, r)
	_ = update(home, id, func(r *state.Record) {
		if r.State != "cleanup-pending" && r.State != "stopped" && r.State != "failed" {
			r.State = "stopping"
		}
		if err != nil {
			r.Diagnostic = err.Error()
		}
	})
	if err != nil {
		return 1
	}
	return 0
}

func serve(ctx context.Context, r state.Record) (result error) {
	home, id := r.Config.Home, r.ID
	file := os.NewFile(3, "proxy-listener")
	listener, err := net.FileListener(file)
	_ = file.Close()
	if err != nil {
		return errors.New("inherited-proxy-listener-unavailable")
	}
	defer func() { _ = listener.Close() }()

	var bundle BrowserHandle
	target := r.Config.Target
	if r.Kind == "share" {
		if !bindingAlive(r) {
			return errors.New("upstream-ownership-changed")
		}
	} else {
		if BrowserLauncher == nil {
			return errors.New("browser-runtime-unavailable")
		}
		bundle, err = BrowserLauncher(ctx, r.Config, id)
		if err != nil {
			return err
		}
		target = bundle.Target
		if bundle.Stop != nil {
			defer bundle.Stop()
		}
		if err = update(home, id, func(r *state.Record) {
			r.CDPAddress = bundle.CDPAddress
			r.Marker = bundle.Marker
			r.Owned = bundle.Owned
		}); err != nil {
			return err
		}
	}
	origin := "http://" + r.ProxyAddress
	client := tailnet.New(os.Getenv("REMOTE_GUI_TAILSCALE_SOCKET"))
	var forward *state.Forward
	if r.Config.Transport == "tailscale" {
		forward, err = client.Plan(ctx, "http://"+r.ProxyAddress)
		if err != nil {
			return err
		}
		origin = fmt.Sprintf("https://%s:%d", forward.Host, forward.Port)
	}
	alive := func() bool {
		if r.Kind == "share" {
			return bindingAlive(r)
		}
		for _, owned := range bundle.Owned {
			if !state.Alive(owned.Identity) {
				return false
			}
		}
		return true
	}
	p, err := proxy.New(proxy.Options{ID: id, Origin: origin, Target: target, Deadline: r.Expires, UpstreamAlive: alive, ViewerAssets: bundle.Assets, ViewerPassword: bundle.Password})
	if err != nil {
		return err
	}
	defer p.Revoke()
	public := &http.Server{Handler: p, ConnState: p.ConnState, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 0, IdleTimeout: 30 * time.Second}
	publicErrors := make(chan struct{})
	go func() { _ = public.Serve(listener); close(publicErrors) }()
	// Remove remote exposure while the lifetime guard still reserves this listener.
	defer func() {
		p.Revoke()
		if e := removeForward(home, id); e != nil {
			markPending(home, id, e)
			current, loadErr := state.Load(home, id)
			if loadErr == nil && !state.Alive(current.Guard) {
				pendingController(home, id)
			}
		}
		_ = public.Close()
	}()
	stopped := make(chan struct{})
	var stopOnce sync.Once
	mux := http.NewServeMux()
	mux.HandleFunc("/access", func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodPost {
			w.WriteHeader(405)
			return
		}
		current, e := state.Load(home, id)
		if e != nil || current.State != "ready" {
			w.WriteHeader(409)
			return
		}
		code, e := p.Issue()
		if e != nil {
			w.WriteHeader(409)
			return
		}
		v := view(current, true)
		v.AccessCode = code
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(v)
	})
	mux.HandleFunc("/stop", func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodPost {
			w.WriteHeader(405)
			return
		}
		w.WriteHeader(200)
		stopOnce.Do(func() { close(stopped) })
	})
	controlListener, err := net.Listen("unix", filepath.Join(home, id, "control.sock"))
	if err != nil {
		return errors.New("private-control-socket-unavailable")
	}
	if err = os.Chmod(filepath.Join(home, id, "control.sock"), 0o600); err != nil {
		_ = controlListener.Close()
		return errors.New("private-control-permissions-failed")
	}
	controlServer := &http.Server{Handler: mux, ReadHeaderTimeout: 3 * time.Second, ReadTimeout: 3 * time.Second, WriteTimeout: 3 * time.Second}
	go func() { _ = controlServer.Serve(controlListener) }()
	defer func() { _ = controlServer.Close(); _ = os.Remove(filepath.Join(home, id, "control.sock")) }()
	if err = update(home, id, func(r *state.Record) { r.Origin = origin }); err != nil {
		return err
	}
	if forward != nil {
		lockCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		release, e := state.Lock(lockCtx, home)
		if e != nil {
			cancel()
			return errors.New("tailnet-management-lock-unavailable")
		}
		err = client.Install(lockCtx, forward, func(f *state.Forward) error {
			current, e := state.Load(home, id)
			if e != nil {
				return e
			}
			current.Forward = f
			return state.Save(home, current)
		})
		release()
		cancel()
		if err != nil {
			return err
		}
	}
	cookie, err := p.ProbeCookie()
	if err != nil {
		return err
	}
	var appPath string
	wsPath := ""
	if r.Kind == "share" {
		u, _ := http.NewRequest(http.MethodGet, r.Config.Target, nil)
		appPath = u.URL.RequestURI()
	} else {
		appPath = "/vnc.html"
		wsPath = "/websockify"
	}
	probeCtx, cancelProbe := context.WithDeadline(ctx, minTime(time.Now().Add(15*time.Second), r.Expires))
	defer cancelProbe()
	var last error
	for {
		last = tailnet.Probe(probeCtx, origin, cookie, appPath, wsPath)
		if last == nil {
			break
		}
		select {
		case <-probeCtx.Done():
			return last
		case <-stopped:
			return nil
		case <-time.After(200 * time.Millisecond):
		}
	}
	if err = update(home, id, func(r *state.Record) { r.State = "ready" }); err != nil {
		return err
	}
	ticker := time.NewTicker(150 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-stopped:
			return nil
		case <-publicErrors:
			return errors.New("proxy-server-stopped")
		case <-ticker.C:
			if !time.Now().Before(r.Expires) {
				return nil
			}
			if !state.Alive(r.Guard) {
				return errors.New("lifetime-guard-stopped")
			}
			if !alive() {
				return errors.New("upstream-ownership-changed")
			}
			if p.Problem() != "" {
				return errors.New("compatibility-blocked")
			}
		}
	}
}

func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

func Cleanup(ctx context.Context, home string) ([]View, error) {
	ids, err := state.IDs(home)
	if err != nil {
		return nil, err
	}
	var views []View
	for _, id := range ids {
		if err = ctx.Err(); err != nil {
			return views, err
		}
		r, e := state.Load(home, id)
		if e != nil {
			views = append(views, View{SchemaVersion: 1, ID: id, State: "cleanup-pending", Diagnostic: "invalid-private-state-left-untouched"})
			continue
		}
		if r.State == "stopped" || (r.State == "failed" && r.Forward == nil) {
			views = append(views, view(r, false))
			continue
		}
		if state.Alive(r.Guard) || state.Alive(r.Supervisor) {
			if r.State == "cleanup-pending" {
				_ = control(home, id, "cleanup", nil)
			}
			v, e := Read(home, id)
			if e != nil {
				return views, e
			}
			views = append(views, v)
			continue
		}
		if e = finish(home, id, false); e != nil {
			markPending(home, id, e)
		}
		v, e := Read(home, id)
		if e != nil {
			return views, e
		}
		views = append(views, v)
	}
	return views, nil
}

// pendingController deliberately keeps its listener reserved and access revoked
// until cleanup succeeds. It never releases a stale forward onto a reusable port.
func pendingController(home, id string) {
	trigger := make(chan struct{}, 1)
	socket := filepath.Join(home, id, "control.sock")
	_ = os.Remove(socket)
	listener, err := net.Listen("unix", socket)
	if err == nil {
		_ = os.Chmod(socket, 0o600)
		server := &http.Server{ReadHeaderTimeout: 2 * time.Second, WriteTimeout: 2 * time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost || (r.URL.Path != "/stop" && r.URL.Path != "/cleanup") {
				w.WriteHeader(404)
				return
			}
			select {
			case trigger <- struct{}{}:
			default:
			}
			w.WriteHeader(200)
		})}
		go func() { _ = server.Serve(listener) }()
		defer func() { _ = server.Close() }()
	}
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		if err = finish(home, id, true); err == nil {
			return
		}
		markPending(home, id, err)
		select {
		case <-trigger:
		case <-ticker.C:
		}
	}
}
