// Package clientapp adds a server to, or deletes it from, the Paseo desktop
// app on a client through the Chrome DevTools Protocol.
package clientapp

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"math/rand/v2"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/michielvha/logger"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/link"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/registry"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/remote"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
)

// Waits the Design names. Tests shorten them.
var (
	// CommitDelay covers Chromium's 5 second localStorage commit delay.
	CommitDelay = 8 * time.Second
	// QuitTimeout is how long the app has to quit before it is force-stopped.
	QuitTimeout = 20 * time.Second
	// TunnelTimeout is how long the relaunched app has to open its tunnel.
	TunnelTimeout = 30 * time.Second
	// SettleDelay lets the reloaded app load and rewrite its registry.
	SettleDelay = 4 * time.Second
	// LaunchTimeout is how long the app has to answer on its debugging port.
	LaunchTimeout = 60 * time.Second
	// QuitFloor is the least time quit and wait takes, and so the wait
	// between debug launch attempts.
	QuitFloor = 3 * time.Second
	// InstallerTimeout is how long quit and wait waits for an app update
	// installer.
	InstallerTimeout = 120 * time.Second
	// AliveInterval is how often the CLI checks that the app runs while it
	// waits for the window.
	AliveInterval = 2 * time.Second
)

const (
	registryKey       = "@paseo:daemon-registry"
	clientIDKey       = "@paseo:client-id-v1"
	defaultDaemonPort = 6767
)

var (
	//go:embed snippets/stop.sh
	stopScript string
	//go:embed snippets/stop.ps1
	stopPS string
	//go:embed snippets/launch.sh
	launchScript string
	//go:embed snippets/launch.ps1
	launchPS string
	//go:embed snippets/tunnel.sh
	tunnelScript string
	//go:embed snippets/tunnel.ps1
	tunnelPS string
	//go:embed snippets/running.sh
	runningScript string
	//go:embed snippets/running.ps1
	runningPS string
)

// inject changes an entry before it is written; only paseotest builds set it.
var inject func(json.RawMessage) json.RawMessage

// App drives the desktop app on clients.
type App struct {
	// Dir is PASEO_HOSTS_DIR, where registry backups go.
	Dir string
	// Paseo is the pinned paseo CLI.
	Paseo  string
	Report *report.Reporter
}

// ServerID reads the daemon's serverId over the entry's PASEO_URL.
func (a *App) ServerID(ctx context.Context, e *registry.Entry, password string) (string, error) {
	cmd := exec.CommandContext(ctx, a.Paseo, "daemon", "status", "--host", e.URL, "--json")
	cmd.Env = append(slices.DeleteFunc(os.Environ(), func(kv string) bool { return strings.HasPrefix(kv, "PASEO_PASSWORD=") }), "PASEO_PASSWORD="+password)
	out, err := cmd.Output()
	if err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			return "", fmt.Errorf("paseo daemon status: %s", lastLine(string(ee.Stderr)))
		}
		return "", err
	}
	var st struct {
		ServerID string `json:"serverId"`
	}
	if err := json.Unmarshal(out, &st); err != nil || st.ServerID == "" {
		return "", errors.New("paseo daemon status returned no serverId")
	}
	return st.ServerID, nil
}

// Add upserts the server's entry in the client's app. It has the
// signature of link.AppFunc.
func (a *App) Add(ctx context.Context, c link.Client, e *registry.Entry, password string) error {
	serverID, err := a.ServerID(ctx, e, password)
	if err != nil {
		return report.Errorf(report.ExitFailed, "reading the server id of %s: %v", e.Alias, err)
	}
	host := link.SSHAlias(e.Alias)
	want := newEntry(serverID, e.Alias, password, Connection(host, e.ListenPort))
	a.Report.Step("Adding %s to the Paseo app on %s", e.Alias, c.Alias)
	forced, err := a.session(ctx, c, change{
		apply: func(prev []json.RawMessage) ([]json.RawMessage, error) { return upsert(prev, want, time.Now()) },
		kept:  func(prev, cur []json.RawMessage) bool { return keptEntry(prev, cur, want) },
	})
	if err != nil {
		return err
	}
	if _, err := c.Run(ctx, tunnelScript, tunnelPS, remote.Vars{
		"name": host, "port": strconv.Itoa(e.ListenPort), "wait_ms": ms(TunnelTimeout),
	}); err != nil {
		if forced {
			return report.Errorf(report.ExitFailed, "the app on %s was force-stopped and may not have saved the change (%v); run the command again", c.Alias, err)
		}
		return remoteError("checking the app's tunnel", err)
	}
	if err := a.stillRuns(ctx, c); err != nil {
		return err
	}
	a.Report.Pass("the Paseo app on %s lists %s and opened its tunnel", c.Alias, e.Alias)
	return nil
}

// Delete removes the server's entries from the client's app: those with
// serverID, when it is known, and those with a connection to
// paseo-<alias>.
func (a *App) Delete(ctx context.Context, c link.Client, alias, serverID string) error {
	host := link.SSHAlias(alias)
	match := func(raw json.RawMessage) bool { return Matches(raw, serverID, host) }
	a.Report.Step("Deleting %s from the Paseo app on %s", alias, c.Alias)
	forced, err := a.session(ctx, c, change{
		apply: func(prev []json.RawMessage) ([]json.RawMessage, error) {
			return slices.DeleteFunc(slices.Clone(prev), match), nil
		},
		kept: func(prev, cur []json.RawMessage) bool {
			return !slices.ContainsFunc(cur, match) && sameOthers(prev, cur, match)
		},
	})
	if err != nil {
		return err
	}
	if forced {
		return report.Errorf(report.ExitFailed, "the app on %s was force-stopped and may not have saved the change; run the command again", c.Alias)
	}
	if err := a.stillRuns(ctx, c); err != nil {
		return err
	}
	a.Report.Pass("the Paseo app on %s no longer lists %s", c.Alias, alias)
	return nil
}

// Matches reports whether a registry entry has serverID or a Remote SSH
// connection to host.
func Matches(raw json.RawMessage, serverID, host string) bool {
	var h struct {
		ServerID    string `json:"serverId"`
		Connections []struct {
			Type string `json:"type"`
			Host string `json:"host"`
		} `json:"connections"`
	}
	if json.Unmarshal(raw, &h) != nil {
		return false
	}
	if serverID != "" && h.ServerID == serverID {
		return true
	}
	return slices.ContainsFunc(h.Connections, func(c struct {
		Type string `json:"type"`
		Host string `json:"host"`
	},
	) bool {
		return c.Type == "remoteSsh" && c.Host == host
	})
}

type change struct {
	apply func(prev []json.RawMessage) ([]json.RawMessage, error)
	kept  func(prev, cur []json.RawMessage) bool
}

// unknownError ends a session whose outcome the CLI cannot confirm: it
// stops driving the app and keeps a copy of the backup.
type unknownError struct{ reason string }

func (e *unknownError) Error() string { return e.reason }

func unknown(format string, args ...any) error {
	return &unknownError{reason: fmt.Sprintf(format, args...)}
}

// installingError reports that quit and wait gave up on an app update
// installer; the command leaves the app stopped.
type installingError struct{ client string }

func (e *installingError) Error() string {
	return fmt.Sprintf("an app update on %s was still installing after %v, so the app is left stopped; run it again once the update has installed", e.client, InstallerTimeout)
}

// errLost marks a window that does not answer.
var errLost = errors.New("the app window does not answer")

// run is one command's session with the app on a client.
type run struct {
	a  *App
	c  link.Client
	ch change

	pg  *page
	fwd *forwarder
	// wrote reports a registry write since the running instance launched.
	wrote     bool
	lastWrite time.Time
	// forced reports a step 5 force-stop of an instance that had written.
	forced bool
	// losses counts the lost windows; the Design allows two per command.
	losses int

	// raw and had are the registry before the command; prev is raw parsed.
	raw  string
	had  bool
	prev []json.RawMessage
	data string

	rollingBack bool
	reasons     []string
	// installing reports that quit and wait gave up on an installer.
	installing bool
}

// session runs Design steps 2 to 6 up to the tunnel check. It reports
// whether the step 5 quit force-stopped an instance that holds the change.
func (a *App) session(ctx context.Context, c link.Client, ch change) (bool, error) {
	r := &run{a: a, c: c, ch: ch}
	defer r.closeForward()
	if err := r.quitAndWait(ctx); err != nil {
		if r.installing {
			return false, r.unchanged(ctx, err)
		}
		return false, err
	}
	if err := r.debugLaunch(ctx); err != nil {
		return false, r.unchanged(ctx, err)
	}
	if err := r.readBackup(ctx); err != nil {
		return false, r.unchanged(ctx, err)
	}
	kept, err := r.writeChange(ctx)
	if err == nil && !kept {
		err = r.rollBack(ctx)
	}
	var u *unknownError
	switch {
	case errors.As(err, &u):
		return false, r.unconfirmed(ctx, u)
	case err != nil:
		return false, err
	}
	if err := r.finish(ctx); err != nil {
		if r.installing {
			return false, report.Errorf(report.ExitFailed, "the app on %s kept the change, but %v", c.Alias, err)
		}
		return false, r.unconfirmed(ctx, &unknownError{reason: err.Error()})
	}
	if err := r.relaunch(ctx); err != nil {
		return false, err
	}
	return r.forced, nil
}

// readBackup reads the registry and saves the backup (step 3).
func (r *run) readBackup(ctx context.Context) error {
	raw, ok, err := r.pg.getItem(ctx, registryKey)
	if err != nil {
		return err
	}
	prev, err := parseRegistry(raw, ok)
	if err != nil {
		return err
	}
	next, err := r.ch.apply(prev)
	if err != nil {
		return err
	}
	data, err := json.Marshal(next)
	if err != nil {
		return err
	}
	if ok {
		if err := r.a.backup(r.c.Alias, raw); err != nil {
			return err
		}
	}
	r.raw, r.had, r.prev, r.data = raw, ok, prev, string(data)
	return nil
}

// writeChange writes the change and reloads (steps 3 and 4), rewriting it
// after a lost window that may have lost the write, and reports whether
// the app kept it.
func (r *run) writeChange(ctx context.Context) (bool, error) {
	r.writeAndReload(ctx, r.data, false)
	for {
		cur, ok, graceful, err := r.readBack(ctx)
		if err != nil {
			return false, err
		}
		if !graceful && r.matchesBackup(cur, ok) {
			r.writeAndReload(ctx, r.data, false)
			continue
		}
		hosts, err := parseRegistry(cur, ok)
		if err == nil && r.ch.kept(r.prev, hosts) {
			r.a.Report.Pass("the app on %s kept the change after a reload", r.c.Alias)
			return true, nil
		}
		return false, nil
	}
}

// rollBack restores the backup and checks it after a restart, twice at
// most. It returns nil only when a check found the backup.
func (r *run) rollBack(ctx context.Context) error {
	r.rollingBack = true
	if _, err := r.restore(ctx); err != nil {
		return err
	}
	for range 2 {
		if err := r.finish(ctx); err != nil {
			return unknown("%v", err)
		}
		if err := r.debugLaunch(ctx); err != nil {
			return unknown("%v", err)
		}
		cur, ok, _, err := r.readBack(ctx)
		if err != nil {
			return err
		}
		if r.matchesBackup(cur, ok) {
			restored := fmt.Sprintf("the app on %s did not keep the change; its previous host list is restored", r.c.Alias)
			if err := r.finish(ctx); err != nil {
				if r.installing {
					return report.Errorf(report.ExitFailed, "%s; %v", r.withReasons(restored), err)
				}
				return unknown("%v", err)
			}
			if err := r.relaunch(ctx); err != nil {
				return err
			}
			return report.Errorf(report.ExitFailed, "%s", r.withReasons(restored))
		}
		if _, err := r.restore(ctx); err != nil {
			return err
		}
	}
	return unknown("the app did not hold the restored host list after a restart")
}

// restore writes the backup, or removes the key when there was none, up to
// three times until the read-back matches it.
func (r *run) restore(ctx context.Context) (bool, error) {
	for range 3 {
		r.writeAndReload(ctx, r.raw, !r.had)
		cur, ok, _, err := r.readBack(ctx)
		if err != nil {
			return false, err
		}
		if r.matchesBackup(cur, ok) {
			return true, nil
		}
	}
	return false, nil
}

// writeAndReload writes value, or removes the key, and reloads the page.
// A failure shows as a lost window in the read that follows.
func (r *run) writeAndReload(ctx context.Context, value string, remove bool) {
	if r.pg == nil {
		return
	}
	var err error
	if remove {
		err = r.pg.removeItem(ctx, registryKey)
	} else {
		err = r.pg.setItem(ctx, registryKey, value)
	}
	r.wrote, r.lastWrite = true, time.Now()
	if err == nil {
		_, err = r.pg.call(ctx, "Page.reload", map[string]any{})
	}
	if err != nil {
		logger.Debug("registry write", "client", r.c.Alias, "error", err)
	}
	r.closePage()
}

// readBack waits for the window and reads the registry. A window that
// does not answer is quit and debug-launched again, at most twice per
// command; graceful is false when one of those quits was not graceful.
func (r *run) readBack(ctx context.Context) (cur string, ok, graceful bool, err error) {
	graceful = true
	for {
		cur, ok, err = r.read(ctx)
		if err == nil || ctx.Err() != nil {
			return cur, ok, graceful, err
		}
		logger.Debug("lost window", "client", r.c.Alias, "error", err)
		g, err := r.recover(ctx)
		if err != nil {
			return "", false, false, err
		}
		graceful = graceful && g
	}
}

func (r *run) read(ctx context.Context) (string, bool, error) {
	if err := sleep(ctx, SettleDelay); err != nil {
		return "", false, err
	}
	if r.pg == nil {
		if r.fwd == nil {
			return "", false, errLost
		}
		p, err := r.waitPage(ctx)
		if err != nil {
			return "", false, err
		}
		r.pg = p
	}
	v, ok, err := r.pg.getItem(ctx, registryKey)
	if err != nil {
		r.closePage()
	}
	return v, ok, err
}

// recover quits an app whose window stopped answering and debug-launches
// it again. It reports whether the app quit gracefully.
func (r *run) recover(ctx context.Context) (bool, error) {
	if r.losses == 2 {
		return false, unknown("the app window stopped answering a third time")
	}
	r.losses++
	r.a.Report.Step("The app window on %s stopped answering; restarting the app", r.c.Alias)
	r.closePage()
	wait := ms(QuitTimeout)
	if r.c.Kind == link.Windows {
		// window.close() needs the page, so Windows stops the process.
		wait = "0"
	}
	stopped, err := r.stop(ctx, wait, "KILL")
	r.closeForward()
	if stopped == "KILL" {
		r.forceStopped()
	}
	if err != nil {
		return false, unknown("%v", err)
	}
	if err := r.debugLaunch(ctx); err != nil {
		return false, unknown("%v", err)
	}
	return stopped == "graceful", nil
}

// debugLaunch starts the app with a debugging port and connects to its
// window, in up to three attempts with a quit and wait between them.
func (r *run) debugLaunch(ctx context.Context) error {
	var last error
	quit := true
	for attempt := range 3 {
		if !quit {
			logger.Debug("debug launch failed", "client", r.c.Alias, "attempt", attempt, "error", last)
			if err := r.quitAndWait(ctx); err != nil {
				return err
			}
		}
		quit = false
		// An update install can start the app again after quit and wait.
		alive, err := r.a.running(ctx, r.c)
		if err != nil {
			return err
		}
		if alive {
			last = errors.New("the Paseo app started again before its debug launch")
			logger.Debug("debug launch", "client", r.c.Alias, "attempt", attempt+1, "error", last)
			if err := r.quitAndWait(ctx); err != nil {
				return err
			}
			quit = true
			continue
		}
		port := 20000 + rand.IntN(40000)
		if err := r.a.launch(ctx, r.c, strconv.Itoa(port)); err != nil {
			var f *remote.Failure
			if !errors.As(err, &f) {
				return remoteError("starting the Paseo app", err)
			}
			last = err
			continue
		}
		r.wrote = false
		fwd, err := forward(ctx, r.c.Alias, port)
		if err != nil {
			return err
		}
		r.fwd = fwd
		p, err := r.waitPage(ctx)
		if err == nil {
			r.pg = p
			return nil
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		last = err
		r.closeForward()
	}
	return fmt.Errorf("the Paseo app on %s did not answer over DevTools in three attempts: %w", r.c.Alias, last)
}

// waitPage connects to the app window, failing when the app's main
// process exits or the window has not answered within LaunchTimeout.
func (r *run) waitPage(ctx context.Context) (*page, error) {
	deadline := time.Now().Add(LaunchTimeout)
	var nextCheck time.Time
	for {
		p, err := tryPages(ctx, r.fwd.addr)
		if err == nil {
			return p, nil
		}
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("the Paseo app window did not answer over DevTools within %v: %w", LaunchTimeout, err)
		}
		if time.Now().After(nextCheck) {
			alive, aerr := r.a.running(ctx, r.c)
			if aerr != nil {
				return nil, aerr
			}
			if !alive {
				return nil, errors.New("the Paseo app exited before its window answered")
			}
			nextCheck = time.Now().Add(AliveInterval)
		}
		if err := sleep(ctx, 200*time.Millisecond); err != nil {
			return nil, err
		}
	}
}

// finish runs step 5 for the running instance: it waits for the commit,
// quits the app gracefully, force-stops it if it does not quit, closes
// the forward and waits.
func (r *run) finish(ctx context.Context) error {
	if r.wrote {
		if err := sleep(ctx, time.Until(r.lastWrite.Add(CommitDelay))); err != nil {
			return err
		}
	}
	if r.c.Kind == link.Windows && r.fwd != nil {
		closeWindow(ctx, r.fwd.addr)
	}
	r.closePage()
	stopped, err := r.stop(ctx, ms(QuitTimeout), "KILL")
	r.closeForward()
	if stopped == "KILL" {
		r.a.Report.Partial("the app on %s did not quit within %v and was force-stopped", r.c.Alias, QuitTimeout)
		r.forced = r.forced || r.wrote
		r.forceStopped()
	}
	r.wrote = false
	return err
}

func (r *run) forceStopped() {
	const reason = "the app was force-stopped during the rollback"
	if r.rollingBack && !slices.Contains(r.reasons, reason) {
		r.reasons = append(r.reasons, reason)
	}
}

// stop quits the app and waits as quit and wait does. It reports how the
// app stopped even when the wait gave up on an installer.
func (r *run) stop(ctx context.Context, waitMS, fallback string) (string, error) {
	stopped, installing, err := r.a.stop(ctx, r.c, waitMS, fallback)
	if err == nil && installing {
		r.installing = true
		err = &installingError{client: r.c.Alias}
	}
	return stopped, err
}

// quitAndWait quits the app as step 2 does and waits.
func (r *run) quitAndWait(ctx context.Context) error {
	wait := ms(QuitTimeout)
	if r.c.Kind == link.Windows {
		// The app holds none of the CLI's writes yet.
		wait = "0"
	}
	r.closePage()
	_, err := r.stop(ctx, wait, "TERM")
	return err
}

// relaunch is step 6: start the app without the debugging port.
func (r *run) relaunch(ctx context.Context) error {
	if err := r.a.launch(ctx, r.c, ""); err != nil {
		return remoteError("starting the Paseo app", err)
	}
	return nil
}

// unchanged ends a session that wrote nothing.
func (r *run) unchanged(ctx context.Context, cause error) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if r.installing {
		return report.Errorf(report.ExitFailed, "%v; the app's host list on %s is unchanged", cause, r.c.Alias)
	}
	_ = r.finish(ctx)
	launchErr := r.relaunch(ctx)
	if err := report.Errorf(report.ExitFailed, "%v; the app's host list on %s is unchanged", cause, r.c.Alias); launchErr == nil {
		return err
	}
	return report.Errorf(report.ExitFailed, "%v; the app's host list on %s is unchanged, and %v", cause, r.c.Alias, launchErr)
}

// unconfirmed ends a session whose result the CLI cannot confirm: it stops
// the app, keeps a copy of the backup and relaunches the app.
func (r *run) unconfirmed(ctx context.Context, u *unknownError) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if !r.installing {
		_ = r.finish(ctx)
	}
	msg := fmt.Sprintf("the CLI could not tell whether the app on %s kept the change (%s)", r.c.Alias, u.reason)
	if r.rollingBack {
		msg = fmt.Sprintf("the app on %s did not keep the change, and the CLI could not confirm that its previous host list is restored (%s)", r.c.Alias, u.reason)
	}
	msg = r.withReasons(msg)
	if r.had {
		path, err := r.a.keepCopy(r.c.Alias, r.raw)
		if err != nil {
			msg += fmt.Sprintf("; keeping a copy of the previous host list failed: %v", err)
		} else {
			msg += "; the previous host list is kept in " + path + ", and the README gives the steps to restore it"
		}
	} else {
		msg += "; the app had no host list before the command, so there is no copy to restore"
	}
	if r.installing {
		return report.Errorf(report.ExitFailed, "%s", msg)
	}
	if err := r.relaunch(ctx); err != nil {
		msg += fmt.Sprintf("; %v", err)
	}
	return report.Errorf(report.ExitFailed, "%s", msg)
}

func (r *run) withReasons(msg string) string {
	for _, reason := range r.reasons {
		msg += "; " + reason
	}
	return msg
}

func (r *run) closePage() {
	if r.pg != nil {
		r.pg.close()
		r.pg = nil
	}
}

func (r *run) closeForward() {
	if r.fwd != nil {
		r.fwd.close()
		r.fwd = nil
	}
}

// matchesBackup reports whether the registry read back holds the backup:
// no key when there was none, otherwise the same hosts by serverId, each
// equal apart from the fields the app rewrites on load.
func (r *run) matchesBackup(cur string, ok bool) bool {
	if !r.had || !ok {
		return r.had == ok
	}
	want, err1 := comparable(r.raw)
	got, err2 := comparable(cur)
	if err1 != nil || err2 != nil || len(want) != len(got) {
		return false
	}
	for _, w := range want {
		i := slices.IndexFunc(got, func(g map[string]any) bool { return reflect.DeepEqual(g, w) })
		if i < 0 {
			return false
		}
		got = slices.Delete(got, i, i+1)
	}
	return true
}

// comparable parses a registry into entries without createdAt and
// updatedAt and with Remote SSH connections in the app's normalized form.
func comparable(raw string) ([]map[string]any, error) {
	var hosts []map[string]any
	if raw != "" {
		if err := json.Unmarshal([]byte(raw), &hosts); err != nil {
			return nil, err
		}
	}
	for _, h := range hosts {
		delete(h, "createdAt")
		delete(h, "updatedAt")
		conns, _ := h["connections"].([]any)
		for _, c := range conns {
			m, ok := c.(map[string]any)
			if !ok || m["type"] != "remoteSsh" {
				continue
			}
			old := m["id"]
			normalizeConnection(m)
			if h["preferredConnectionId"] == old {
				h["preferredConnectionId"] = m["id"]
			}
		}
	}
	return hosts, nil
}

// normalizeConnection rewrites a Remote SSH connection the way the app
// does on load: the default daemon port is dropped and the id is derived
// from the host and ports.
func normalizeConnection(c map[string]any) {
	port := ""
	if p, ok := c["daemonPort"].(float64); ok && p != defaultDaemonPort {
		port = strconv.FormatFloat(p, 'f', -1, 64)
	} else {
		delete(c, "daemonPort")
	}
	ssh := ""
	if p, ok := c["sshPort"].(float64); ok {
		ssh = strconv.FormatFloat(p, 'f', -1, 64)
	}
	host, _ := c["host"].(string)
	c["id"] = "ssh:" + encodeURIComponent(host) + ":" + ssh + ":" + port
}

func (a *App) backup(client, raw string) error {
	path := filepath.Join(a.Dir, "app-registry-"+client+".backup.json")
	if err := os.WriteFile(path, []byte(raw), 0o600); err != nil {
		return err
	}
	return os.Chmod(path, 0o600)
}

// keepCopy writes raw to a new app-registry-<client>.<UTC time>.backup.json
// and never replaces an existing copy.
func (a *App) keepCopy(client, raw string) (string, error) {
	at := time.Now().UTC().Truncate(time.Second)
	for range 60 {
		path := filepath.Join(a.Dir, "app-registry-"+client+"."+at.Format("20060102T150405Z")+".backup.json")
		f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if errors.Is(err, fs.ErrExist) {
			at = at.Add(time.Second)
			continue
		}
		if err != nil {
			return "", err
		}
		_, err = f.WriteString(raw)
		if cerr := f.Close(); err == nil {
			err = cerr
		}
		if err == nil {
			err = os.Chmod(path, 0o600)
		}
		return path, err
	}
	return "", errors.New("every copy name for the next minute is taken")
}

// stop quits the app: AppleScript on macOS, then fallback after wait_ms;
// on Windows Stop-Process, at once when wait_ms is 0. Then it waits at
// least QuitFloor and until no app update installer runs, for up to
// InstallerTimeout. It reports how the app stopped, none, graceful or the
// fallback, and whether an installer still ran at the end of the wait.
func (a *App) stop(ctx context.Context, c link.Client, waitMS, fallback string) (string, bool, error) {
	out, err := c.Run(ctx, stopScript, stopPS, remote.Vars{
		"app": c.App, "wait_ms": waitMS, "fallback": fallback,
		"floor_ms": ms(QuitFloor), "limit_ms": ms(InstallerTimeout),
	})
	if err != nil {
		return "", false, remoteError("quitting the Paseo app", err)
	}
	logger.Debug("quit and wait", "client", c.Alias, "stopped", out.Values["STOPPED"],
		"installer", out.Values["INSTALLER"], "installer_source", out.Values["INSTALLER_SOURCE"])
	return out.Values["STOPPED"], out.Values["INSTALLING"] == "yes", nil
}

// launch starts the app, with a debugging port unless debugPort is empty.
func (a *App) launch(ctx context.Context, c link.Client, debugPort string) error {
	_, err := c.Run(ctx, launchScript, launchPS, remote.Vars{"app": c.App, "debug_port": debugPort, "wait_ms": ms(LaunchTimeout)})
	return err
}

// running reports whether the app's main process runs.
func (a *App) running(ctx context.Context, c link.Client) (bool, error) {
	out, err := c.Run(ctx, runningScript, runningPS, remote.Vars{"app": c.App})
	if err != nil {
		return false, remoteError("checking that the Paseo app runs", err)
	}
	return out.Values["RUNNING"] == "yes", nil
}

// stillRuns is the end of step 6: the app's main process must still run.
func (a *App) stillRuns(ctx context.Context, c link.Client) error {
	alive, err := a.running(ctx, c)
	if err != nil {
		return err
	}
	if !alive {
		return report.Errorf(report.ExitFailed, "the Paseo app on %s stopped running after it started; start it again and check its host list", c.Alias)
	}
	return nil
}

// Connection is a Remote SSH connection in the app's normalized form.
func Connection(host string, daemonPort int) map[string]any {
	c := map[string]any{"type": "remoteSsh", "host": host}
	port := ""
	if daemonPort != defaultDaemonPort {
		port = strconv.Itoa(daemonPort)
		c["daemonPort"] = daemonPort
	}
	c["id"] = "ssh:" + encodeURIComponent(host) + "::" + port
	return c
}

func newEntry(serverID, label, password string, conn map[string]any) map[string]any {
	return map[string]any{
		"serverId": serverID, "label": label, "password": password, "lifecycle": map[string]any{},
		"connections": []any{conn}, "preferredConnectionId": conn["id"],
	}
}

// upsert replaces the entry for want's serverId, keeping its appearance and
// createdAt, or appends it, and keeps every other entry as it was.
func upsert(prev []json.RawMessage, want map[string]any, now time.Time) ([]json.RawMessage, error) {
	ts := now.UTC().Format("2006-01-02T15:04:05.000Z")
	entry := map[string]any{"createdAt": ts, "updatedAt": ts}
	for k, v := range want {
		entry[k] = v
	}
	i := slices.IndexFunc(prev, func(raw json.RawMessage) bool { return Matches(raw, want["serverId"].(string), "") })
	if i >= 0 {
		var old struct {
			Appearance json.RawMessage `json:"appearance"`
			CreatedAt  string          `json:"createdAt"`
		}
		if err := json.Unmarshal(prev[i], &old); err == nil {
			if len(old.Appearance) > 0 && string(old.Appearance) != "null" {
				entry["appearance"] = old.Appearance
			}
			if old.CreatedAt != "" {
				entry["createdAt"] = old.CreatedAt
			}
		}
	}
	data, err := json.Marshal(entry)
	if err != nil {
		return nil, err
	}
	if inject != nil {
		data = inject(data)
	}
	next := slices.Clone(prev)
	if i >= 0 {
		next[i] = data
	} else {
		next = append(next, data)
	}
	return next, nil
}

// keptEntry reports whether cur holds want as written, apart from the
// timestamps, and every other entry of prev.
func keptEntry(prev, cur []json.RawMessage, want map[string]any) bool {
	id := want["serverId"].(string)
	match := func(raw json.RawMessage) bool { return Matches(raw, id, "") }
	i := slices.IndexFunc(cur, match)
	if i < 0 || !sameOthers(prev, cur, match) {
		return false
	}
	var got map[string]any
	if json.Unmarshal(cur[i], &got) != nil {
		return false
	}
	delete(got, "appearance")
	delete(got, "createdAt")
	delete(got, "updatedAt")
	var exp map[string]any
	data, _ := json.Marshal(want)
	_ = json.Unmarshal(data, &exp)
	return reflect.DeepEqual(got, exp)
}

// sameOthers reports whether every entry of prev that match does not
// select is still in cur.
func sameOthers(prev, cur []json.RawMessage, match func(json.RawMessage) bool) bool {
	ids := map[string]int{}
	for _, raw := range cur {
		ids[serverIDOf(raw)]++
	}
	for _, raw := range prev {
		if match(raw) {
			continue
		}
		id := serverIDOf(raw)
		if ids[id] == 0 {
			return false
		}
		ids[id]--
	}
	return true
}

func serverIDOf(raw json.RawMessage) string {
	var h struct {
		ServerID string `json:"serverId"`
	}
	_ = json.Unmarshal(raw, &h)
	return h.ServerID
}

func parseRegistry(raw string, ok bool) ([]json.RawMessage, error) {
	if !ok || raw == "" {
		return nil, nil
	}
	var hosts []json.RawMessage
	if err := json.Unmarshal([]byte(raw), &hosts); err != nil {
		return nil, report.Errorf(report.ExitFailed, "the app's host registry is not a list: %v", err)
	}
	return hosts, nil
}

// encodeURIComponent matches the JavaScript function the app uses.
func encodeURIComponent(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		if c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || strings.IndexByte("-_.!~*'()", c) >= 0 {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

type forwarder struct {
	addr string
	cmd  *exec.Cmd
	done chan struct{}
}

// forward opens an SSH forward from a free loopback port on the operator
// host to the app's debugging port on the client, and waits until it
// accepts connections.
func forward(ctx context.Context, alias string, port int) (*forwarder, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	addr := ln.Addr().String()
	_ = ln.Close()
	cmd := exec.CommandContext(ctx, "ssh", "-N", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "ExitOnForwardFailure=yes",
		"-L", addr+":127.0.0.1:"+strconv.Itoa(port), alias)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("forwarding the debugging port: %w", err)
	}
	f := &forwarder{addr: addr, cmd: cmd, done: make(chan struct{})}
	go func() {
		_ = cmd.Wait()
		close(f.done)
	}()
	deadline := time.Now().Add(forwardTimeout)
	for {
		if c, err := net.DialTimeout("tcp", addr, time.Second); err == nil {
			_ = c.Close()
			return f, nil
		}
		select {
		case <-f.done:
			return nil, report.Errorf(report.ExitFailed, "forwarding the debugging port of the app on %s failed: %s", alias, lastLine(stderr.String()))
		case <-ctx.Done():
			f.close()
			return nil, ctx.Err()
		case <-time.After(100 * time.Millisecond):
		}
		if time.Now().After(deadline) {
			f.close()
			return nil, report.Errorf(report.ExitFailed, "forwarding the debugging port of the app on %s did not open within %v", alias, forwardTimeout)
		}
	}
}

// forwardTimeout covers ssh's 15 second connect timeout.
const forwardTimeout = 20 * time.Second

func (f *forwarder) close() {
	_ = f.cmd.Process.Kill()
	<-f.done
}

func sleep(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

func ms(d time.Duration) string { return strconv.FormatInt(d.Milliseconds(), 10) }

func remoteError(step string, err error) error {
	return report.Errorf(report.ExitFailed, "%s: %v", step, err)
}

func lastLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	return strings.TrimSpace(lines[len(lines)-1])
}
