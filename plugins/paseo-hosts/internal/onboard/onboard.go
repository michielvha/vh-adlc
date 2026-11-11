// Package onboard installs or refreshes a server's daemon, password and
// exposure, and verifies its authentication.
package onboard

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/config"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/registry"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/remote"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/runtime"
)

var (
	//go:embed snippets/preflight.sh
	preflightScript string
	//go:embed snippets/install.sh
	installScript string
	//go:embed snippets/exposure.sh
	exposureScript string
)

// RetryDelay is the wait between attempts while the daemon answers 503.
var RetryDelay = 3 * time.Second

const retries = 20

// Options for one onboard run. A zero port flag means the flag was not given.
type Options struct {
	Alias          string
	Config         config.Config
	ListenPortFlag int
	ServePortFlag  int
	Publish        bool
	ClientHost     string
	Report         *report.Reporter
}

// Result is what onboard reports.
type Result struct {
	Alias           string   `json:"alias"`
	URL             string   `json:"url"`
	Exposure        string   `json:"exposure"`
	DaemonPort      int      `json:"daemon_port"`
	ServePort       int      `json:"serve_port,omitempty"`
	PasswordCreated bool     `json:"password_created"`
	Relink          []string `json:"relink,omitempty"`
}

type route struct {
	port  int
	proxy string
}

// Run onboards o.Alias.
func Run(ctx context.Context, o Options) (*Result, error) {
	rep, cfg := o.Report, o.Config
	entry, err := registry.Load(cfg.Dir, o.Alias)
	existing := err == nil
	if err != nil && report.Code(err) != report.ExitConfig {
		return nil, err
	}
	if err != nil {
		if _, statErr := os.Stat(registry.EnvPath(cfg.Dir, o.Alias)); statErr == nil {
			return nil, err
		}
	}
	listenPort := cfg.ListenPort
	if o.ListenPortFlag != 0 {
		listenPort = o.ListenPortFlag
	}
	servePort := cfg.ServePort
	if existing {
		if o.ListenPortFlag != 0 && o.ListenPortFlag != entry.ListenPort {
			return nil, report.Errorf(report.ExitUsage,
				"%s already runs on port %d; linked clients name that port, so --listen-port %d is refused", o.Alias, entry.ListenPort, o.ListenPortFlag)
		}
		listenPort = entry.ListenPort
		if o.ServePortFlag == 0 && entry.ServePort != 0 {
			servePort = entry.ServePort
		}
	}
	if o.ServePortFlag != 0 {
		servePort = o.ServePortFlag
	}
	if err := runtime.Require(); err != nil {
		return nil, err
	}

	rep.Step("Checking %s", o.Alias)
	facts, err := remote.Bash(ctx, o.Alias, preflightScript, remote.Vars{
		"listen_port": strconv.Itoa(listenPort),
		"publish":     yesNo(o.Publish),
	})
	if err != nil {
		return nil, remoteError("preflight", err)
	}
	user, dns, agents := facts.Values["USER"], facts.Values["DNS"], facts.Values["AGENTS"]
	routes := parseRoutes(facts.Text)
	daemonTarget := fmt.Sprintf("http://127.0.0.1:%d", listenPort)
	var remove []string
	add := ""
	for _, r := range routes {
		switch {
		case r.port == servePort && o.Publish && r.proxy != daemonTarget:
			owner := r.proxy
			if owner == "" {
				owner = "a non-proxy route"
			}
			return nil, report.Errorf(report.ExitFailed, "Serve port %d on %s is already used by %s", servePort, o.Alias, owner)
		case r.proxy == daemonTarget && (!o.Publish || r.port != servePort):
			remove = append(remove, strconv.Itoa(r.port))
		}
	}
	if o.Publish && !slices.Contains(routes, route{servePort, daemonTarget}) {
		add = strconv.Itoa(servePort)
	}
	rep.Pass("%s has Node, npm, Git, lingering and agents %s", o.Alias, agents)

	if err := registry.EnsureDir(cfg.Dir); err != nil {
		return nil, err
	}
	password, created, err := registry.EnsurePassword(cfg.Dir, o.Alias)
	if err != nil {
		return nil, err
	}
	if created {
		rep.Pass("created the password in %s", registry.PasswordPath(cfg.Dir, o.Alias))
	}
	rt, err := runtime.Ensure(ctx, cfg.Cache, cfg.Version)
	if err != nil {
		return nil, err
	}
	hash, err := rt.Hash(ctx, password)
	if err != nil {
		return nil, err
	}

	rep.Step("Installing Paseo %s and paseo.service on %s", cfg.Version, o.Alias)
	hostnames := []string{"localhost", "127.0.0.1"}
	if dns != "" {
		hostnames = append(hostnames, dns)
	}
	hostnamesJSON, _ := json.Marshal(hostnames)
	if _, err := remote.Bash(ctx, o.Alias, installScript, remote.Vars{
		"version":     cfg.Version,
		"listen_port": strconv.Itoa(listenPort),
		"hostnames":   string(hostnamesJSON),
		"hash":        hash,
	}); err != nil {
		return nil, remoteError("install", err)
	}
	rep.Pass("paseo.service answers on 127.0.0.1:%d", listenPort)

	if len(remove) > 0 || add != "" {
		if _, err := remote.Bash(ctx, o.Alias, exposureScript, remote.Vars{
			"remove_ports": strings.Join(remove, " "),
			"add_port":     add,
			"listen_port":  strconv.Itoa(listenPort),
		}); err != nil {
			return nil, remoteError("Serve route change", err)
		}
	}
	for _, p := range remove {
		rep.Pass("removed the Serve route on port %s", p)
	}

	if !existing {
		entry = &registry.Entry{Alias: o.Alias, ListenPort: listenPort}
		resolved, err := remote.Resolve(ctx, o.Alias)
		if err != nil {
			return nil, err
		}
		entry.ClientHost = dns
		if entry.ClientHost == "" {
			entry.ClientHost = resolved.Hostname
		}
		entry.ClientPort = resolved.Port
	}
	res := &Result{Alias: o.Alias, DaemonPort: listenPort, PasswordCreated: created}
	if o.ClientHost != "" && o.ClientHost != entry.ClientHost {
		if existing {
			res.Relink = slices.Clone(entry.Clients)
		}
		entry.ClientHost = o.ClientHost
	}
	entry.SSH, entry.User, entry.DNS, entry.Agents = o.Alias, user, dns, agents
	entry.Published, entry.ServePort, entry.Version = o.Publish, servePort, cfg.Version
	entry.PasswordFile, entry.Unit = registry.PasswordPath(cfg.Dir, o.Alias), "paseo.service"
	entry.URL = fmt.Sprintf("ssh://%s?daemonPort=%d", o.Alias, listenPort)
	res.Exposure = "ssh-only"
	if o.Publish {
		entry.URL = fmt.Sprintf("wss://%s:%d", dns, servePort)
		res.Exposure, res.ServePort = "tailnet", servePort
	}
	res.URL = entry.URL
	if err := entry.Save(cfg.Dir); err != nil {
		return nil, err
	}
	rep.Pass("wrote %s", registry.EnvPath(cfg.Dir, o.Alias))

	if err := Verify(ctx, rt, entry, password, rep); err != nil {
		return nil, err
	}
	if len(res.Relink) > 0 {
		rep.Partial("run link again for %s; the client host name changed", strings.Join(res.Relink, ", "))
	}
	return res, nil
}

// Verify checks a server's exposure and that its daemon refuses a
// connection without a password and accepts the stored one.
func Verify(ctx context.Context, rt *runtime.Runtime, e *registry.Entry, password string, rep *report.Reporter) error {
	if e.Published {
		u := fmt.Sprintf("https://%s:%d/api/health", e.DNS, e.ServePort)
		out, err := exec.CommandContext(ctx, "curl", "--fail", "--silent", "--show-error", "--max-time", "15", u).CombinedOutput()
		if err != nil {
			return report.Errorf(report.ExitFailed, "HTTPS health %s: %s", u, strings.TrimSpace(string(out)))
		}
		rep.Pass("HTTPS health %s", u)
	}
	out, err := paseoLS(ctx, rt, e.URL, "")
	if err == nil {
		return report.Errorf(report.ExitFailed, "the daemon on %s accepted a connection without a password", e.Alias)
	}
	if !strings.Contains(out, "Password required") {
		return report.Errorf(report.ExitFailed, "unexpected answer without a password from %s: %s", e.Alias, lastLine(out))
	}
	rep.Pass("password required")
	if out, err := paseoLS(ctx, rt, e.URL, password); err != nil {
		return report.Errorf(report.ExitFailed, "the stored password was not accepted by %s: %s", e.Alias, lastLine(out))
	}
	rep.Pass("stored password accepted")
	return nil
}

// paseoLS runs `paseo ls` against url, retrying while the daemon starts.
func paseoLS(ctx context.Context, rt *runtime.Runtime, url, password string) (string, error) {
	env := slices.DeleteFunc(os.Environ(), func(kv string) bool { return strings.HasPrefix(kv, "PASEO_PASSWORD=") })
	if password != "" {
		env = append(env, "PASEO_PASSWORD="+password)
	}
	var out []byte
	var err error
	for range retries {
		callCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		cmd := exec.CommandContext(callCtx, rt.Paseo(), "ls", "--host", url, "-q")
		cmd.Env = env
		out, err = cmd.CombinedOutput()
		cancel()
		if err == nil || !strings.Contains(string(out), "response: 503") {
			break
		}
		select {
		case <-ctx.Done():
			return string(out), ctx.Err()
		case <-time.After(RetryDelay):
		}
	}
	return string(out), err
}

func parseRoutes(text string) []route {
	var routes []route
	for _, line := range strings.Split(text, "\n") {
		rest, ok := strings.CutPrefix(line, "ROUTE=")
		if !ok {
			continue
		}
		p, proxy, _ := strings.Cut(rest, " ")
		if port, err := strconv.Atoi(p); err == nil {
			routes = append(routes, route{port, strings.TrimSpace(proxy)})
		}
	}
	return routes
}

func remoteError(step string, err error) error {
	var f *remote.Failure
	if errors.As(err, &f) {
		return report.Errorf(report.ExitFailed, "%s on %s: %s", step, f.Alias, f.Msg)
	}
	return report.Errorf(report.ExitFailed, "%s: %v", step, err)
}

func yesNo(b bool) string {
	if b {
		return "yes"
	}
	return "no"
}

func lastLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	return strings.TrimSpace(lines[len(lines)-1])
}
