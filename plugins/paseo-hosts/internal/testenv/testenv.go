// Package testenv provides stand-in hosts and commands for hermetic tests.
//
// The test binary doubles as every stand-in: New links the names ssh, npm,
// systemctl, loginctl, tailscale, osascript, open and the rest to
// os.Executable, and Main dispatches on the name it was started under. Each
// host is a directory under the environment root with its own home; the
// stand-in ssh runs remote commands there with a clean environment.
package testenv

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
)

const (
	envRoot = "PASEO_TESTENV_ROOT"
	envHost = "PASEO_TESTENV_HOST"
)

// Bootstrap is the fixed remote command for Windows hosts.
const Bootstrap = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "iex ([Console]::In.ReadToEnd())"`

// Kinds of host.
const (
	Linux   = "linux"
	Darwin  = "darwin"
	Windows = "windows"
)

var standins = map[string]func([]string) int{
	"ssh":        sshMain,
	"npm":        npmMain,
	"systemctl":  systemctlMain,
	"loginctl":   loginctlMain,
	"tailscale":  tailscaleMain,
	"curl":       curlMain,
	"ss":         ssMain,
	"paseo":      paseoMain,
	"uname":      unameMain,
	"osascript":  osascriptMain,
	"open":       openMain,
	"pgrep":      pgrepMain,
	"pkill":      pkillMain,
	"node":       passthrough("node"),
	"ssh-keygen": passthrough("ssh-keygen"),
	"codex":      func([]string) int { return 0 },
	"copilot":    func([]string) int { return 0 },
	"claude":     func([]string) int { return 0 },
}

// shared stand-ins are on every host's PATH; the others are per host.
var shared = []string{"ssh", "npm", "systemctl", "loginctl", "curl", "ss", "node", "ssh-keygen"}

// sysTools are the real system commands snippets may use. They are linked
// into one directory so the real ssh, curl, tailscale or systemctl in
// /usr/bin never run.
var sysTools = []string{
	"bash", "sh", "env", "cat", "grep", "sed", "awk", "mkdir", "chmod", "cp", "mv", "rm", "touch",
	"mktemp", "install", "head", "tail", "tr", "cut", "sort", "uniq", "dirname", "basename", "git",
	"printf", "sleep", "seq", "id", "whoami", "hostname", "date", "ls", "wc", "test", "true", "false",
	"readlink", "base64", "sha256sum", "tee", "xargs", "rmdir", "ln", "timeout", "stat", "find", "cmp",
}

// Main runs a stand-in when the test binary was started under a stand-in
// name, and the tests otherwise. Call it from TestMain.
func Main(m *testing.M) {
	name := filepath.Base(os.Args[0])
	if f, ok := standins[name]; ok && os.Getenv(envRoot) != "" {
		record(name, os.Args[1:])
		os.Exit(f(os.Args[1:]))
	}
	os.Exit(m.Run())
}

// Env is one hermetic world: an operator home and a set of hosts.
type Env struct {
	t    *testing.T
	Root string
	Home string
	Bin  string
	Sys  string
}

// New creates an environment and points HOME, PATH and the PASEO_HOSTS_*
// variables of the test process at it.
func New(t *testing.T) *Env {
	t.Helper()
	root := t.TempDir()
	e := &Env{t: t, Root: root, Home: filepath.Join(root, "operator"), Bin: filepath.Join(root, "bin"), Sys: filepath.Join(root, "sys")}
	for _, d := range []string{e.Bin, e.Sys, filepath.Join(e.Home, ".ssh"), filepath.Join(root, "hosts")} {
		must(t, os.MkdirAll(d, 0o700))
	}
	exe, err := os.Executable()
	must(t, err)
	for _, name := range shared {
		must(t, os.Symlink(exe, filepath.Join(e.Bin, name)))
	}
	tools := map[string]string{}
	for _, name := range []string{"node", "ssh-keygen", "pwsh"} {
		if p, err := exec.LookPath(name); err == nil {
			tools[name] = p
		}
	}
	data, err := json.Marshal(tools)
	must(t, err)
	must(t, os.WriteFile(filepath.Join(root, "real.json"), data, 0o600))
	for _, name := range sysTools {
		if p, err := exec.LookPath(name); err == nil {
			must(t, os.Symlink(p, filepath.Join(e.Sys, name)))
		}
	}
	t.Setenv(envRoot, root)
	t.Setenv(envHost, "")
	t.Setenv("HOME", e.Home)
	t.Setenv("USER", "operator")
	t.Setenv("PATH", e.Bin+string(os.PathListSeparator)+e.Sys)
	// Race-enabled stand-ins otherwise wait one second before they exit.
	t.Setenv("GORACE", "atexit_sleep_ms=0")
	for _, k := range []string{
		"XDG_CACHE_HOME", "XDG_CONFIG_HOME", "PASEO_HOSTS_DIR", "PASEO_HOSTS_CLIENT", "PASEO_HOSTS_VERSION",
		"PASEO_HOSTS_LISTEN_PORT", "PASEO_HOSTS_SERVE_PORT", "PASEO_HOSTS_CACHE", "PASEO_HOSTS_CLIENT_KEY",
		"PASEO_PASSWORD", "NO_COLOR",
	} {
		t.Setenv(k, "")
	}
	return e
}

// RemoveTool takes a stand-in off the operator PATH.
func (e *Env) RemoveTool(name string) {
	must(e.t, os.Remove(filepath.Join(e.Bin, name)))
}

// Host is one stand-in machine.
type Host struct {
	Name string
	Kind string
	User string
	Dir  string
	Home string
	Bin  string
	env  *Env
}

// ServerOptions describe a Linux server.
type ServerOptions struct {
	User     string
	DNS      string // tailnet name; empty means no Tailscale
	Agents   []string
	SSHPort  int
	NoLinger bool
}

// Server adds a Linux server reachable as name.
func (e *Env) Server(name string, o ServerOptions) *Host {
	if o.User == "" {
		o.User = "dev"
	}
	if o.Agents == nil {
		o.Agents = []string{"codex", "claude"}
	}
	h := e.host(name, Linux, o.User)
	for _, a := range o.Agents {
		h.link(a)
	}
	if o.DNS != "" {
		h.Mark("dns", o.DNS)
		h.link("tailscale")
		h.Alias(o.DNS)
	}
	if o.SSHPort != 0 && o.SSHPort != 22 {
		h.Mark("ssh-port", strconv.Itoa(o.SSHPort))
	}
	if o.NoLinger {
		h.Mark("no-linger", "")
	}
	out, err := exec.Command(realTool(e.Root, "ssh-keygen"), "-q", "-t", "ed25519", "-N", "", "-C", "", "-f", filepath.Join(h.Dir, "hostkey")).CombinedOutput()
	if err != nil {
		e.t.Fatalf("host key: %v %s", err, out)
	}
	return h
}

// Client adds a client machine of the given kind.
func (e *Env) Client(name, kind string) *Host {
	h := e.host(name, kind, "me")
	if kind == Darwin {
		for _, n := range []string{"uname", "osascript", "open", "pgrep", "pkill"} {
			h.link(n)
		}
	}
	return h
}

func (e *Env) host(name, kind, user string) *Host {
	dir := filepath.Join(e.Root, "hosts", name)
	h := &Host{Name: name, Kind: kind, User: user, Dir: dir, Home: filepath.Join(dir, "home"), Bin: filepath.Join(dir, "bin"), env: e}
	for _, d := range []string{h.Home, h.Bin, filepath.Join(dir, "tmp")} {
		must(e.t, os.MkdirAll(d, 0o700))
	}
	h.Mark("kind", kind)
	h.Mark("user", user)
	return h
}

func (h *Host) link(name string) {
	exe, err := os.Executable()
	must(h.env.t, err)
	must(h.env.t, os.Symlink(exe, filepath.Join(h.Bin, name)))
}

// Mark writes a marker file in the host directory.
func (h *Host) Mark(name, content string) {
	must(h.env.t, os.WriteFile(filepath.Join(h.Dir, name), []byte(content), 0o600))
}

// Unmark deletes a marker file.
func (h *Host) Unmark(name string) {
	if err := os.Remove(filepath.Join(h.Dir, name)); err != nil && !os.IsNotExist(err) {
		h.env.t.Fatal(err)
	}
}

// Marked reports whether a marker file exists.
func (h *Host) Marked(name string) bool {
	_, err := os.Stat(filepath.Join(h.Dir, name))
	return err == nil
}

// Alias makes the host reachable under other names.
func (h *Host) Alias(names ...string) {
	for _, n := range names {
		must(h.env.t, os.Symlink(h.Dir, filepath.Join(h.env.Root, "hosts", n)))
	}
}

// HostKey returns the host's public key as "type base64".
func (h *Host) HostKey() string {
	data, err := os.ReadFile(filepath.Join(h.Dir, "hostkey.pub"))
	must(h.env.t, err)
	f := strings.Fields(string(data))
	return f[0] + " " + f[1]
}

// Path joins rel to the host's home.
func (h *Host) Path(rel string) string { return filepath.Join(h.Home, rel) }

// Read returns a file under the host's home, or "" when it is missing.
func (h *Host) Read(rel string) string {
	data, err := os.ReadFile(h.Path(rel))
	if err != nil && !os.IsNotExist(err) {
		h.env.t.Fatal(err)
	}
	return string(data)
}

// Write creates a file under the host's home.
func (h *Host) Write(rel, content string, mode os.FileMode) {
	p := h.Path(rel)
	must(h.env.t, os.MkdirAll(filepath.Dir(p), 0o700))
	must(h.env.t, os.WriteFile(p, []byte(content), mode))
}

// Trust adds the server's host key to the operator's known_hosts under name,
// hashed when hashed is true.
func (e *Env) Trust(server *Host, name string, hashed bool) {
	kh := filepath.Join(e.Home, ".ssh", "known_hosts")
	f, err := os.OpenFile(kh, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	must(e.t, err)
	_, err = fmt.Fprintf(f, "%s %s\n", name, server.HostKey())
	must(e.t, err)
	must(e.t, f.Close())
	if hashed {
		out, err := exec.Command(realTool(e.Root, "ssh-keygen"), "-H", "-f", kh).CombinedOutput()
		if err != nil {
			e.t.Fatalf("hash known_hosts: %v %s", err, out)
		}
		_ = os.Remove(kh + ".old")
	}
}

// Call is one recorded stand-in invocation.
type Call struct {
	Name string   `json:"name"`
	Args []string `json:"args"`
	Host string   `json:"host"`
}

// Calls returns every recorded invocation in order.
func (e *Env) Calls() []Call {
	f, err := os.Open(filepath.Join(e.Root, "calls.jsonl"))
	if os.IsNotExist(err) {
		return nil
	}
	must(e.t, err)
	defer func() { _ = f.Close() }()
	var calls []Call
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<24)
	for sc.Scan() {
		var c Call
		must(e.t, json.Unmarshal(sc.Bytes(), &c))
		calls = append(calls, c)
	}
	return calls
}

// CallsTo returns the recorded invocations of one stand-in.
func (e *Env) CallsTo(name string) []Call {
	return slices.DeleteFunc(e.Calls(), func(c Call) bool { return c.Name != name })
}

// RequirePwsh skips the test when pwsh is not on PATH.
// CheckReport fails t when a status line repeats the label the reporter
// already adds, such as "Passed: Passed: ...".
func CheckReport(t testing.TB, out string) {
	t.Helper()
	for _, line := range strings.Split(out, "\n") {
		for _, label := range []string{"Passed: ", "Failed: ", "Partial: ", "Skipped: ", "No results: "} {
			if i := strings.Index(line, label); i >= 0 && strings.Contains(line[i+len(label):], label) {
				t.Errorf("status line repeats its label: %q", line)
			}
		}
	}
}

func RequirePwsh(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("pwsh"); err != nil {
		t.Skip("pwsh is not on PATH; skipping the PowerShell snippet test")
	}
}

func record(name string, args []string) {
	root := os.Getenv(envRoot)
	data, err := json.Marshal(Call{Name: name, Args: args, Host: os.Getenv(envHost)})
	if err != nil {
		return
	}
	f, err := os.OpenFile(filepath.Join(root, "calls.jsonl"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	_, _ = f.Write(append(data, '\n'))
	_ = f.Close()
}

func realTool(root, name string) string {
	data, err := os.ReadFile(filepath.Join(root, "real.json"))
	if err != nil {
		return name
	}
	var tools map[string]string
	if json.Unmarshal(data, &tools) != nil || tools[name] == "" {
		return name
	}
	return tools[name]
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
