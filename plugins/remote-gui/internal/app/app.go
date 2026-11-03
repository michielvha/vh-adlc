// Package app implements CLI presentation and dependency diagnostics.
package app

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"syscall"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/tailnet"
)

type Result struct {
	SchemaVersion int      `json:"schema_version"`
	Command       string   `json:"command"`
	Result        string   `json:"result"`
	Kind          string   `json:"kind,omitempty"`
	Diagnostic    string   `json:"diagnostic,omitempty"`
	Missing       []string `json:"missing,omitempty"`
}

type Executor func(config.Config) (any, error)

func Run(args []string, out io.Writer) int { return RunWith(args, out, nil) }
func RunWith(args []string, out io.Writer, execute Executor) int {
	c, err := config.Parse(args)
	if err != nil {
		_ = json.NewEncoder(out).Encode(Result{SchemaVersion: 1, Result: "invalid-arguments", Diagnostic: err.Error()})
		return 2
	}
	if c.Command == "help" {
		_, _ = fmt.Fprintln(out, "remote-gui: doctor | share <local-http-url> | start | status [id] | access <id> [--reveal] | stop <id> | cleanup\nOptions: --transport tailscale|loopback --ttl 2h --home <private-directory> --kind share|browser")
		return 0
	}
	if runtime.GOOS != "linux" || runtime.GOARCH != "amd64" {
		_ = json.NewEncoder(out).Encode(Result{SchemaVersion: 1, Command: c.Command, Result: "unsupported-platform", Diagnostic: "runtime sessions currently require Linux amd64"})
		return 1
	}
	if c.Command == "doctor" {
		r := Doctor(c)
		_ = json.NewEncoder(out).Encode(r)
		if r.Result != "ready" {
			return 1
		}
		return 0
	}
	if execute == nil {
		_ = json.NewEncoder(out).Encode(Result{SchemaVersion: 1, Command: c.Command, Result: "unavailable", Diagnostic: "session lifecycle is unavailable"})
		return 1
	}
	r, err := execute(c)
	if err != nil {
		_ = json.NewEncoder(out).Encode(Result{SchemaVersion: 1, Command: c.Command, Result: "failed", Diagnostic: err.Error()})
		return 1
	}
	if err = json.NewEncoder(out).Encode(r); err != nil {
		return 1
	}
	return 0
}

func Tool(env, fallback string) string {
	if value := os.Getenv(env); value != "" {
		return value
	}
	return fallback
}

func Doctor(c config.Config) Result {
	r := Result{SchemaVersion: 1, Command: "doctor", Kind: c.Kind, Result: "ready"}
	tools := map[string]string{}
	if c.Transport == "tailscale" {
		tools["tailscale"] = "tailscale"
	}
	if c.Kind == "browser" {
		tools["Xvfb"] = Tool("REMOTE_GUI_XVFB", "Xvfb")
		tools["x11vnc"] = Tool("REMOTE_GUI_X11VNC", "x11vnc")
		tools["websockify"] = Tool("REMOTE_GUI_WEBSOCKIFY", "websockify")
		tools["chromium"] = Tool("REMOTE_GUI_CHROMIUM", "chromium-browser")
		tools["xauth"] = Tool("REMOTE_GUI_XAUTH", "xauth")
		assets := Tool("REMOTE_GUI_NOVNC", "/usr/share/novnc")
		if fi, err := os.Stat(filepath.Join(assets, "vnc.html")); err != nil || !fi.Mode().IsRegular() {
			r.Missing = append(r.Missing, "noVNC assets (REMOTE_GUI_NOVNC)")
		}
	}
	for name, path := range tools {
		if _, err := exec.LookPath(path); err != nil {
			r.Missing = append(r.Missing, name)
		}
	}
	sort.Strings(r.Missing)
	if len(r.Missing) > 0 {
		r.Result = "missing-dependencies"
		r.Diagnostic = "provide existing host tools or configure REMOTE_GUI tool paths; no packages were installed"
	}
	if r.Result == "ready" {
		identity, err := state.Inspect(os.Getpid())
		if err != nil || state.Signal(identity, syscall.Signal(0)) != nil {
			r.Result = "capability-unavailable"
			r.Diagnostic = "Linux process identity and pidfd signalling are required"
			return r
		}
		if c.Transport == "tailscale" {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_, err := tailnet.New(os.Getenv("REMOTE_GUI_TAILSCALE_SOCKET")).Plan(ctx, "http://127.0.0.1:1")
			if err != nil {
				r.Result = "capability-unavailable"
				r.Diagnostic = err.Error() + "; conditional LocalAPI reads and ETag/If-Match updates are required; no configuration was changed"
			}
		}
	}
	return r
}
