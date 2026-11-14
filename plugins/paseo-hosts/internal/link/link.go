// Package link gives a client a tunnel-only key and alias for a server and
// hands the desktop app step to the caller.
package link

import (
	"bytes"
	"context"
	_ "embed"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/config"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/registry"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/remote"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
)

// Client platforms.
const (
	Darwin  = "darwin"
	Windows = "windows"
)

var (
	//go:embed snippets/darwin-app.sh
	darwinAppScript string
	//go:embed snippets/probe.ps1
	probeScript string
	//go:embed snippets/key.sh
	keyScript string
	//go:embed snippets/key.ps1
	keyPS string
	//go:embed snippets/authorize.sh
	authorizeScript string
	//go:embed snippets/client-ssh.sh
	clientSSHScript string
	//go:embed snippets/client-ssh.ps1
	clientSSHPS string
	//go:embed snippets/tunnel.sh
	tunnelScript string
	//go:embed snippets/tunnel.ps1
	tunnelPS string
)

// Client is a probed client.
type Client struct {
	Alias string
	Kind  string
	// App is the desktop app's path, set when the probe looked for it.
	App string
}

// tunnelWait is the longest the tunnel check waits by its own timers, in
// its Windows snippet.
const tunnelWait = 35 * time.Second

// Run runs a platform's snippet on the client.
func (c Client) Run(ctx context.Context, bash, powershell string, vars remote.Vars) (remote.Output, error) {
	if c.Kind == Windows {
		return remote.PowerShell(ctx, c.Alias, powershell, vars)
	}
	return remote.Bash(ctx, c.Alias, bash, vars)
}

// AppFunc adds the server to the client's desktop app.
type AppFunc func(ctx context.Context, c Client, e *registry.Entry, password string) error

// Options for one link run.
type Options struct {
	Alias  string
	Client string
	Config config.Config
	NoApp  bool
	App    AppFunc
	Report *report.Reporter
}

// Result is what link reports.
type Result struct {
	Alias    string `json:"alias"`
	Client   string `json:"client"`
	Platform string `json:"platform"`
	SSHAlias string `json:"ssh_alias"`
	App      bool   `json:"app"`
}

// SSHAlias is the client-side alias of a server.
func SSHAlias(alias string) string { return "paseo-" + alias }

// KeyComment is the comment on a client's authorized_keys line.
func KeyComment(client string) string { return "paseo-hosts:" + client }

var pubKeyRE = regexp.MustCompile(`^([a-z0-9@.-]+) ([A-Za-z0-9+/]+=*)(\s|$)`)

// Run links o.Client to o.Alias.
func Run(ctx context.Context, o Options) (*Result, error) {
	rep, cfg := o.Report, o.Config
	if !registry.ValidAlias(o.Client) {
		return nil, report.Errorf(report.ExitUsage, "invalid client alias %q", o.Client)
	}
	entry, err := registry.Load(cfg.Dir, o.Alias)
	if err != nil {
		return nil, err
	}
	var password string
	if !o.NoApp {
		if o.App == nil {
			return nil, errors.New("link: no desktop app step")
		}
		if password, err = registry.ReadPassword(cfg.Dir, o.Alias); err != nil {
			return nil, err
		}
	}

	rep.Step("Probing %s", o.Client)
	client, err := Probe(ctx, o.Client, !o.NoApp)
	if err != nil {
		return nil, err
	}
	hostKeys, err := HostKeys(ctx, entry.SSH)
	if err != nil {
		return nil, err
	}
	rep.Pass("%s is %s, %d host key(s) for %s", o.Client, client.Kind, len(hostKeys), entry.SSH)

	if !entry.HasClient(o.Client) {
		entry.AddClient(o.Client)
		if err := entry.Save(cfg.Dir); err != nil {
			return nil, err
		}
	}

	rep.Step("Setting up SSH access from %s to %s", o.Client, o.Alias)
	out, err := client.Run(remote.WithDeadline(ctx, remote.Deadline(0)), keyScript, keyPS, remote.Vars{"key_name": cfg.ClientKey})
	if err != nil {
		return nil, remoteError("creating the client key", err)
	}
	m := pubKeyRE.FindStringSubmatch(strings.TrimSpace(out.Values["PUB"]))
	if m == nil {
		return nil, report.Errorf(report.ExitFailed, "%s returned no usable public key", o.Client)
	}
	pub := m[1] + " " + m[2]
	if _, err := remote.Bash(ctx, entry.SSH, authorizeScript, remote.Vars{
		"port": strconv.Itoa(entry.ListenPort), "key": pub, "comment": KeyComment(o.Client),
	}); err != nil {
		return nil, remoteError("authorizing the client key", err)
	}
	rep.Pass("tunnel-only key line for %s on %s", o.Client, o.Alias)

	name := SSHAlias(o.Alias)
	if _, err := client.Run(remote.WithDeadline(ctx, remote.Deadline(0)), clientSSHScript, clientSSHPS, remote.Vars{
		"name":       name,
		"known_name": KnownName(entry.ClientHost, entry.ClientPort),
		"host_keys":  strings.Join(hostKeys, "\n"),
		"host_name":  entry.ClientHost,
		"port":       strconv.Itoa(entry.ClientPort),
		"user":       entry.User,
		"key_name":   cfg.ClientKey,
	}); err != nil {
		return nil, remoteError("writing the alias block", err)
	}
	rep.Pass("alias %s on %s", name, o.Client)

	tctx := remote.WithDeadline(ctx, remote.Deadline(tunnelWait))
	if _, err := client.Run(tctx, tunnelScript, tunnelPS, remote.Vars{"name": name, "port": strconv.Itoa(entry.ListenPort)}); err != nil {
		return nil, remoteError("checking the tunnel", err)
	}
	rep.Pass("the tunnel answers and a shell command is refused")

	res := &Result{Alias: o.Alias, Client: o.Client, Platform: client.Kind, SSHAlias: name}
	if o.NoApp {
		rep.Skip("desktop app (--no-app)")
		return res, nil
	}
	if err := o.App(ctx, client, entry, password); err != nil {
		return nil, err
	}
	res.App = true
	return res, nil
}

// Probe identifies a client's platform and, with needApp, checks for the
// desktop app.
func Probe(ctx context.Context, alias string, needApp bool) (Client, error) {
	return probe(ctx, alias, yesNo(needApp))
}

// ProbeForApp identifies a client's platform and finds the desktop app,
// leaving App empty when it is not installed.
func ProbeForApp(ctx context.Context, alias string) (Client, error) {
	return probe(ctx, alias, "optional")
}

// probe takes needApp as yes, no or optional.
func probe(ctx context.Context, alias, needApp string) (Client, error) {
	c := Client{Alias: alias}
	ctx = remote.WithDeadline(ctx, remote.Deadline(0))
	out, err := remote.Command(ctx, alias, "uname", "-s")
	if errors.Is(err, remote.ErrUnreachable) {
		return c, &report.Error{Code: report.ExitFailed, Msg: err.Error(), Err: err}
	}
	var to *remote.Timeout
	if errors.As(err, &to) {
		return c, remoteError("the uname -s probe", err)
	}
	if err == nil && strings.TrimSpace(out.Text) == "Darwin" {
		c.Kind = Darwin
		if needApp != "no" {
			app, err := remote.Bash(ctx, alias, darwinAppScript, remote.Vars{"need_app": needApp})
			if err != nil {
				return c, remoteError("probe", err)
			}
			c.App = app.Values["APP"]
		}
		return c, nil
	}
	answer := strings.TrimSpace(out.Text)
	ps, err := remote.PowerShell(ctx, alias, probeScript, remote.Vars{"need_app": needApp})
	if errors.As(err, &to) {
		return c, remoteError("the PowerShell probe", err)
	}
	if ps.Values["OS"] != "Windows_NT" {
		if answer == "" {
			answer = "no answer"
		}
		return c, report.Errorf(report.ExitUnsupported, "client %s is neither macOS nor Windows (uname -s: %s)", alias, answer)
	}
	if err != nil {
		return c, remoteError("probe", err)
	}
	c.Kind, c.App = Windows, ps.Values["APP"]
	return c, nil
}

// KnownName is the known_hosts name of host at port.
func KnownName(host string, port int) string {
	if port == 0 || port == 22 {
		return host
	}
	return fmt.Sprintf("[%s]:%d", host, port)
}

// HostKeys returns the server's host keys from the operator's known_hosts,
// under the name and port that `ssh -G` resolves for alias.
func HostKeys(ctx context.Context, alias string) ([]string, error) {
	resolved, err := remote.Resolve(ctx, alias)
	if err != nil {
		return nil, err
	}
	name := resolved.HostKeyAlias
	if name == "" {
		name = KnownName(resolved.Hostname, resolved.Port)
	}
	var keys []string
	for _, f := range resolved.KnownHosts {
		if _, err := os.Stat(f); err != nil {
			continue
		}
		out, err := exec.CommandContext(ctx, "ssh-keygen", "-F", name, "-f", f).Output()
		if err != nil {
			continue
		}
		for _, line := range bytes.Split(out, []byte("\n")) {
			fields := strings.Fields(string(line))
			if len(fields) < 3 || strings.HasPrefix(fields[0], "#") || strings.HasPrefix(fields[0], "@") {
				continue
			}
			if k := fields[1] + " " + fields[2]; !slices.Contains(keys, k) {
				keys = append(keys, k)
			}
		}
	}
	if len(keys) == 0 {
		return nil, report.Errorf(report.ExitFailed, "no host key for %s in this host's known_hosts; connect once with: ssh %s", name, alias)
	}
	return keys, nil
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
