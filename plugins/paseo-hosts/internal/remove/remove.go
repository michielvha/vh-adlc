// Package remove takes clients off a server with unlink and deletes a server
// with remove.
package remove

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/clientapp"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/config"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/link"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/registry"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/remote"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
)

var (
	//go:embed snippets/client-pub.sh
	clientPubScript string
	//go:embed snippets/client-pub.ps1
	clientPubPS string
	//go:embed snippets/unblock.sh
	unblockScript string
	//go:embed snippets/unblock.ps1
	unblockPS string
	//go:embed snippets/keys.sh
	keysScript string
	//go:embed snippets/teardown.sh
	teardownScript string
)

// App is the desktop app step; *clientapp.App implements it.
type App interface {
	ServerID(ctx context.Context, e *registry.Entry, password string) (string, error)
	Delete(ctx context.Context, c link.Client, alias, serverID string) error
}

// Options for one unlink or remove run.
type Options struct {
	Alias string
	// Clients holds unlink's one client, or remove's --client values.
	Clients    []string
	ServerOnly bool
	NoClients  bool
	SkipServer bool
	Purge      bool
	Config     config.Config
	App        App
	Report     *report.Reporter
}

// ClientResult is what happened to one client.
type ClientResult struct {
	Client string `json:"client"`
	// Contacted is false when only the server side was changed.
	Contacted bool `json:"contacted"`
	// App is true when an app entry was deleted.
	App bool `json:"app"`
}

// Result is what unlink and remove report.
type Result struct {
	Alias   string         `json:"alias"`
	Clients []ClientResult `json:"clients"`
	// Server is true when the server's daemon and files were removed.
	Server bool `json:"server"`
	Purged bool `json:"purged,omitempty"`
}

type keyLine struct {
	key     string
	comment string
}

// Unlink takes o.Clients[0] off o.Alias.
func Unlink(ctx context.Context, o Options) (*Result, error) {
	if len(o.Clients) != 1 {
		return nil, report.Errorf(report.ExitUsage, "unlink takes one client")
	}
	name := o.Clients[0]
	if !registry.ValidAlias(name) {
		return nil, report.Errorf(report.ExitUsage, "invalid client alias %q", name)
	}
	entry, err := registry.Load(o.Config.Dir, o.Alias)
	if err != nil {
		return nil, err
	}
	res := &Result{Alias: o.Alias}
	var cr ClientResult
	var serverID string
	if o.ServerOnly {
		if cr, err = serverOnly(ctx, o, entry, name); err != nil {
			return nil, err
		}
		serverID = o.serverID(ctx, entry)
	} else {
		o.Report.Step("Probing %s", name)
		c, err := link.ProbeForApp(ctx, name)
		if errors.Is(err, remote.ErrUnreachable) {
			return nil, report.Errorf(report.ExitFailed, "%v; if %s is gone, run: paseo-hosts unlink %s --client %s --server-only", err, name, o.Alias, name)
		}
		if err != nil {
			return nil, err
		}
		pub, err := readPub(ctx, c, o.Config.ClientKey)
		if err != nil {
			return nil, err
		}
		serverID = o.serverID(ctx, entry)
		if cr, err = o.unlinkClient(ctx, entry, c, pub, serverID, true); err != nil {
			return nil, err
		}
	}
	res.Clients = append(res.Clients, cr)
	if err := cleanBackups(o.Config.Dir, o.Alias, serverID); err != nil {
		return res, err
	}
	return res, nil
}

// Remove unlinks every client of o.Alias and deletes the server.
func Remove(ctx context.Context, o Options) (*Result, error) {
	rep := o.Report
	entry, err := registry.Load(o.Config.Dir, o.Alias)
	if err != nil {
		return nil, err
	}
	names := slices.Clone(entry.Clients)
	for _, n := range o.Clients {
		if !registry.ValidAlias(n) {
			return nil, report.Errorf(report.ExitUsage, "invalid client alias %q", n)
		}
		if !slices.Contains(names, n) {
			names = append(names, n)
		}
	}
	if o.SkipServer && len(names) == 0 && !o.NoClients {
		return nil, report.Errorf(report.ExitConfig,
			"%s records no client and no --client was given; without the server, remove cannot read its key lines, so name each client with --client, or pass --no-clients to leave any client's app entry and alias block", o.Alias)
	}

	clients := map[string]link.Client{}
	pubs := map[string]string{}
	var unreachable []string
	for _, n := range names {
		rep.Step("Probing %s", n)
		c, err := link.ProbeForApp(ctx, n)
		if errors.Is(err, remote.ErrUnreachable) {
			if o.SkipServer {
				unreachable = append(unreachable, n)
				continue
			}
			return nil, report.Errorf(report.ExitFailed,
				"%v; to drop %s without contacting it, run: paseo-hosts unlink %s --client %s --server-only, then run remove again", err, n, o.Alias, n)
		}
		if err != nil {
			return nil, err
		}
		if pubs[n], err = readPub(ctx, c, o.Config.ClientKey); err != nil {
			return nil, err
		}
		clients[n] = c
	}

	var serverID string
	if !o.SkipServer {
		lines, err := listKeys(ctx, entry)
		if errors.Is(err, remote.ErrUnreachable) {
			return nil, report.Errorf(report.ExitFailed, "%v; if the server is gone, run: paseo-hosts remove %s --skip-server", err, o.Alias)
		}
		if err != nil {
			return nil, err
		}
		owned := map[string]bool{}
		for _, n := range names {
			if k := keyData(pubs[n]); k != "" {
				owned[k] = true
			}
			owned[link.KeyComment(n)] = true
		}
		var foreign []string
		for _, l := range lines {
			if !owned[l.key] && !owned[l.comment] {
				foreign = append(foreign, describe(l))
			}
		}
		if len(foreign) > 0 && !o.NoClients {
			return nil, report.Errorf(report.ExitConfig,
				"%s has tunnel-only key lines that no client being unlinked owns: %s; name their clients with --client, or pass --no-clients to delete the lines and leave those clients' app entries and alias blocks",
				o.Alias, strings.Join(foreign, ", "))
		}
		serverID = o.serverID(ctx, entry)
	}

	res := &Result{Alias: o.Alias}
	for _, n := range names {
		if slices.Contains(unreachable, n) {
			entry.RemoveClient(n)
			if err := entry.Save(o.Config.Dir); err != nil {
				return res, err
			}
			rep.Partial("Partial: dropped %s, which did not answer; it keeps its %s app entry and alias block", n, o.Alias)
			res.Clients = append(res.Clients, ClientResult{Client: n})
			continue
		}
		cr, err := o.unlinkClient(ctx, entry, clients[n], pubs[n], serverID, !o.SkipServer)
		if err != nil {
			return res, report.Errorf(report.Code(err), "%v; run remove again to continue", err)
		}
		res.Clients = append(res.Clients, cr)
	}

	if o.SkipServer {
		rep.Skip("Skipped: every step on %s (--skip-server)", o.Alias)
	} else {
		rep.Step("Removing Paseo from %s", o.Alias)
		if _, err := deleteKeys(ctx, entry, nil, "", true); err != nil {
			return res, err
		}
		if _, err := remote.Bash(ctx, entry.SSH, teardownScript, remote.Vars{
			"port": strconv.Itoa(entry.ListenPort), "purge": yesNo(o.Purge),
		}); err != nil {
			return res, remoteError("removing paseo.service", err)
		}
		res.Server, res.Purged = true, o.Purge
		if o.Purge {
			rep.Pass("Passed: paseo.service, its Serve routes and ~/.local/share/paseo are gone from %s", o.Alias)
		} else {
			rep.Pass("Passed: paseo.service, its Serve routes, the runtime and the password hash are gone from %s", o.Alias)
		}
	}
	if err := registry.Delete(o.Config.Dir, o.Alias); err != nil {
		return res, err
	}
	if err := cleanBackups(o.Config.Dir, o.Alias, serverID); err != nil {
		return res, err
	}
	rep.Pass("Passed: the registry files and password of %s are gone", o.Alias)
	return res, nil
}

// unlinkClient runs the unlink steps on a probed client; with server, it
// also deletes the client's key line.
func (o Options) unlinkClient(ctx context.Context, entry *registry.Entry, c link.Client, pub, serverID string, server bool) (ClientResult, error) {
	rep := o.Report
	cr := ClientResult{Client: c.Alias, Contacted: true}
	if c.App == "" {
		rep.Skip("Skipped: no Paseo app on %s", c.Alias)
	} else {
		if err := o.App.Delete(ctx, c, o.Alias, serverID); err != nil {
			return cr, err
		}
		cr.App = true
	}
	name := link.SSHAlias(o.Alias)
	if _, err := c.Run(ctx, unblockScript, unblockPS, remote.Vars{"name": name}); err != nil {
		return cr, remoteError("deleting the alias block", err)
	}
	rep.Pass("Passed: no %s alias block on %s", name, c.Alias)
	if server {
		var keys []string
		if k := keyData(pub); k != "" {
			keys = append(keys, k)
		}
		if _, err := deleteKeys(ctx, entry, keys, link.KeyComment(c.Alias), false); err != nil {
			return cr, err
		}
		rep.Pass("Passed: no key line for %s on %s", c.Alias, o.Alias)
	}
	return cr, o.drop(entry, c.Alias)
}

// serverOnly drops a client on the server side only.
func serverOnly(ctx context.Context, o Options, entry *registry.Entry, name string) (ClientResult, error) {
	cr := ClientResult{Client: name}
	lines, err := listKeys(ctx, entry)
	if err != nil {
		return cr, err
	}
	comment := link.KeyComment(name)
	owned := slices.ContainsFunc(lines, func(l keyLine) bool { return l.comment == comment })
	if !entry.HasClient(name) && !owned {
		msg := fmt.Sprintf("%s is not a recorded client of %s and no key line has the comment %s; nothing was changed", name, o.Alias, comment)
		var foreign []string
		for _, l := range lines {
			if !slices.ContainsFunc(entry.Clients, func(c string) bool { return l.comment == link.KeyComment(c) }) {
				foreign = append(foreign, describe(l))
			}
		}
		if len(foreign) > 0 {
			msg += fmt.Sprintf(". Tunnel-only key lines no recorded client owns: %s; paseo-hosts remove %s --no-clients deletes them", strings.Join(foreign, ", "), o.Alias)
		}
		return cr, report.Errorf(report.ExitFailed, "%s", msg)
	}
	if owned {
		if _, err := deleteKeys(ctx, entry, nil, comment, false); err != nil {
			return cr, err
		}
		o.Report.Pass("Passed: no key line for %s on %s", name, o.Alias)
	}
	if err := o.drop(entry, name); err != nil {
		return cr, err
	}
	o.Report.Partial("Partial: %s was not contacted and may still hold the %s app entry and alias block", name, o.Alias)
	return cr, nil
}

func (o Options) drop(entry *registry.Entry, client string) error {
	if !entry.HasClient(client) {
		return nil
	}
	entry.RemoveClient(client)
	return entry.Save(o.Config.Dir)
}

// serverID reads the daemon's serverId, or returns "" so that app entries
// are matched by connection host alone.
func (o Options) serverID(ctx context.Context, entry *registry.Entry) string {
	password, err := registry.ReadPassword(o.Config.Dir, o.Alias)
	if err == nil {
		var id string
		if id, err = o.App.ServerID(ctx, entry, password); err == nil {
			return id
		}
	}
	o.Report.Skip("Skipped: reading the server id of %s (%v); app entries are matched by connection host %s", o.Alias, err, link.SSHAlias(o.Alias))
	return ""
}

func readPub(ctx context.Context, c link.Client, keyName string) (string, error) {
	out, err := c.Run(ctx, clientPubScript, clientPubPS, remote.Vars{"key_name": keyName})
	if err != nil {
		return "", remoteError("reading the client key", err)
	}
	return strings.TrimSpace(out.Values["PUB"]), nil
}

func keyData(pub string) string {
	if f := strings.Fields(pub); len(f) >= 2 {
		return f[1]
	}
	return ""
}

func describe(l keyLine) string {
	if l.comment != "" {
		return l.comment
	}
	k := l.key
	if len(k) > 16 {
		k = "..." + k[len(k)-16:]
	}
	return "a key ending " + k
}

func listKeys(ctx context.Context, e *registry.Entry) ([]keyLine, error) {
	out, err := remote.Bash(ctx, e.SSH, keysScript, remote.Vars{
		"port": strconv.Itoa(e.ListenPort), "action": "list", "keys": "", "comment": "", "all": "no",
	})
	if errors.Is(err, remote.ErrUnreachable) {
		return nil, &report.Error{Code: report.ExitFailed, Msg: err.Error(), Err: err}
	}
	if err != nil {
		return nil, remoteError("reading authorized_keys", err)
	}
	var lines []keyLine
	for _, l := range strings.Split(out.Text, "\n") {
		if rest, ok := strings.CutPrefix(strings.TrimRight(l, "\r"), "LINE="); ok {
			key, comment, _ := strings.Cut(rest, " ")
			lines = append(lines, keyLine{key: key, comment: comment})
		}
	}
	return lines, nil
}

func deleteKeys(ctx context.Context, e *registry.Entry, keys []string, comment string, all bool) (int, error) {
	out, err := remote.Bash(ctx, e.SSH, keysScript, remote.Vars{
		"port": strconv.Itoa(e.ListenPort), "action": "delete", "keys": strings.Join(keys, "\n"), "comment": comment, "all": yesNo(all),
	})
	if err != nil {
		return 0, remoteError("deleting key lines", err)
	}
	n, _ := strconv.Atoi(out.Values["DELETED"])
	return n, nil
}

// cleanBackups deletes the server's entries from the app backups in dir.
func cleanBackups(dir, alias, serverID string) error {
	paths, err := filepath.Glob(filepath.Join(dir, "app-registry-*.backup.json"))
	if err != nil {
		return err
	}
	paths = append(paths, filepath.Join(dir, "mac-app-registry.backup.json"))
	host := link.SSHAlias(alias)
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return err
		}
		var hosts []json.RawMessage
		if err := json.Unmarshal(data, &hosts); err != nil {
			return report.Errorf(report.ExitFailed, "%s is not an app host list, so it may still hold %s: %v", p, alias, err)
		}
		kept := make([]json.RawMessage, 0, len(hosts))
		for _, h := range hosts {
			if !clientapp.Matches(h, serverID, host) {
				kept = append(kept, h)
			}
		}
		if len(kept) == len(hosts) {
			continue
		}
		out, err := json.Marshal(kept)
		if err != nil {
			return err
		}
		if err := os.WriteFile(p, out, 0o600); err != nil {
			return err
		}
		if err := os.Chmod(p, 0o600); err != nil {
			return err
		}
	}
	return nil
}

func remoteError(step string, err error) error {
	var f *remote.Failure
	if errors.As(err, &f) {
		return report.Errorf(report.ExitFailed, "%s on %s: %s", step, f.Alias, f.Msg)
	}
	return &report.Error{Code: report.ExitFailed, Msg: fmt.Sprintf("%s: %v", step, err), Err: err}
}

func yesNo(b bool) string {
	if b {
		return "yes"
	}
	return "no"
}
