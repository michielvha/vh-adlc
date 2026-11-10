// Package clientapp adds a server to, or deletes it from, the Paseo desktop
// app on a client through the Chrome DevTools Protocol.
package clientapp

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
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
	err = a.session(ctx, c, change{
		apply:    func(prev []json.RawMessage) ([]json.RawMessage, error) { return upsert(prev, want, time.Now()) },
		kept:     func(prev, cur []json.RawMessage) bool { return keptEntry(prev, cur, want) },
		forcedOK: true,
	})
	if err != nil {
		return err
	}
	if _, err := c.Run(ctx, tunnelScript, tunnelPS, remote.Vars{
		"name": host, "port": strconv.Itoa(e.ListenPort), "wait_ms": ms(TunnelTimeout),
	}); err != nil {
		return remoteError("checking the app's tunnel", err)
	}
	a.Report.Pass("Passed: the Paseo app on %s lists %s and opened its tunnel", c.Alias, e.Alias)
	return nil
}

// Delete removes the server's entries from the client's app: those with
// serverID, when it is known, and those with a connection to
// paseo-<alias>.
func (a *App) Delete(ctx context.Context, c link.Client, alias, serverID string) error {
	host := link.SSHAlias(alias)
	match := func(raw json.RawMessage) bool { return Matches(raw, serverID, host) }
	a.Report.Step("Deleting %s from the Paseo app on %s", alias, c.Alias)
	err := a.session(ctx, c, change{
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
	a.Report.Pass("Passed: the Paseo app on %s no longer lists %s", c.Alias, alias)
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
	// forcedOK accepts a force-stopped app; the caller checks the result.
	forcedOK bool
}

// session runs Design steps 2 to 5: quit, relaunch with a debugging port,
// write and verify, wait for the commit, quit and relaunch normally.
func (a *App) session(ctx context.Context, c link.Client, ch change) error {
	if _, err := a.stop(ctx, c, 0); err != nil {
		return err
	}
	debugPort := 20000 + rand.IntN(40000)
	if err := a.launch(ctx, c, strconv.Itoa(debugPort)); err != nil {
		return err
	}
	fwd, err := forward(ctx, c.Alias, debugPort)
	var lastWrite time.Time
	var writeErr error
	if err != nil {
		writeErr = err
	} else {
		lastWrite, writeErr = a.write(ctx, fwd.addr, c, ch)
	}

	if !lastWrite.IsZero() {
		if err := sleep(ctx, time.Until(lastWrite.Add(CommitDelay))); err != nil {
			return err
		}
	}
	if fwd != nil && c.Kind == link.Windows {
		closeWindow(ctx, fwd.addr)
	}
	stopped, stopErr := a.stop(ctx, c, QuitTimeout)
	if fwd != nil {
		fwd.close()
	}
	launchErr := a.launch(ctx, c, "")
	forced := stopped == "KILL"
	if forced {
		a.Report.Partial("Partial: the app on %s did not quit within %v and was force-stopped", c.Alias, QuitTimeout)
	}
	switch {
	case writeErr != nil && forced:
		return report.Errorf(report.ExitFailed, "%v; the app was force-stopped and may not have saved the restored host list, so run the command again", writeErr)
	case writeErr != nil:
		return writeErr
	case stopErr != nil:
		return stopErr
	case launchErr != nil:
		return launchErr
	case forced && !lastWrite.IsZero() && !ch.forcedOK:
		return report.Errorf(report.ExitFailed, "the app on %s was force-stopped and may not have saved the change; run the command again", c.Alias)
	}
	return nil
}

// write runs Design steps 3 and 4 and returns the time of the last
// registry write.
func (a *App) write(ctx context.Context, addr string, c link.Client, ch change) (time.Time, error) {
	var lastWrite time.Time
	p, err := findPage(ctx, addr)
	if err != nil {
		return lastWrite, err
	}
	raw, ok, err := p.getItem(ctx, registryKey)
	if err != nil {
		p.close()
		return lastWrite, err
	}
	prev, err := parseRegistry(raw, ok)
	if err != nil {
		p.close()
		return lastWrite, err
	}
	if ok {
		if err := a.backup(c.Alias, raw); err != nil {
			p.close()
			return lastWrite, err
		}
	}
	next, err := ch.apply(prev)
	if err != nil {
		p.close()
		return lastWrite, err
	}
	data, err := json.Marshal(next)
	if err != nil {
		p.close()
		return lastWrite, err
	}
	err = p.setItem(ctx, registryKey, string(data))
	lastWrite = time.Now()
	if err == nil {
		_, err = p.call(ctx, "Page.reload", map[string]any{})
	}
	p.close()
	if err != nil {
		return lastWrite, err
	}

	if err := sleep(ctx, SettleDelay); err != nil {
		return lastWrite, err
	}
	if p, err = findPage(ctx, addr); err != nil {
		return lastWrite, err
	}
	defer p.close()
	cur, curOK, err := p.getItem(ctx, registryKey)
	if err != nil {
		return lastWrite, err
	}
	if hosts, perr := parseRegistry(cur, curOK); perr == nil && ch.kept(prev, hosts) {
		a.Report.Pass("Passed: the app on %s kept the change after a reload", c.Alias)
		return lastWrite, nil
	}
	if ok {
		err = p.setItem(ctx, registryKey, raw)
	} else {
		err = p.removeItem(ctx, registryKey)
	}
	lastWrite = time.Now()
	if err == nil {
		_, err = p.call(ctx, "Page.reload", map[string]any{})
	}
	if err != nil {
		return lastWrite, report.Errorf(report.ExitFailed, "the app on %s did not keep the change, and restoring its previous host list failed: %v", c.Alias, err)
	}
	return lastWrite, report.Errorf(report.ExitFailed, "the app on %s did not keep the change; its previous host list is restored", c.Alias)
}

func (a *App) backup(client, raw string) error {
	path := filepath.Join(a.Dir, "app-registry-"+client+".backup.json")
	if err := os.WriteFile(path, []byte(raw), 0o600); err != nil {
		return err
	}
	return os.Chmod(path, 0o600)
}

// stop quits the app and reports how: none, graceful or the fallback
// signal. With wait 0 it is Design step 2.
func (a *App) stop(ctx context.Context, c link.Client, wait time.Duration) (string, error) {
	fallback, waitMS := "KILL", ms(wait)
	if wait == 0 {
		fallback, waitMS = "TERM", ms(QuitTimeout)
		if c.Kind == link.Windows {
			waitMS = "0"
		}
	}
	out, err := c.Run(ctx, stopScript, stopPS, remote.Vars{"app": c.App, "wait_ms": waitMS, "fallback": fallback})
	if err != nil {
		return "", remoteError("quitting the Paseo app", err)
	}
	return out.Values["STOPPED"], nil
}

func (a *App) launch(ctx context.Context, c link.Client, debugPort string) error {
	if _, err := c.Run(ctx, launchScript, launchPS, remote.Vars{"app": c.App, "debug_port": debugPort, "wait_ms": ms(LaunchTimeout)}); err != nil {
		return remoteError("starting the Paseo app", err)
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
}

// forward opens an SSH forward from a free loopback port on the operator
// host to the app's debugging port on the client.
func forward(ctx context.Context, alias string, port int) (*forwarder, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	addr := ln.Addr().String()
	_ = ln.Close()
	cmd := exec.CommandContext(ctx, "ssh", "-N", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "ExitOnForwardFailure=yes",
		"-L", addr+":127.0.0.1:"+strconv.Itoa(port), alias)
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("forwarding the debugging port: %w", err)
	}
	return &forwarder{addr: addr, cmd: cmd}, nil
}

func (f *forwarder) close() {
	_ = f.cmd.Process.Kill()
	_ = f.cmd.Wait()
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
