package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/onboard"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/registry"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/testenv"
)

func TestMain(m *testing.M) {
	onboard.RetryDelay = 10 * time.Millisecond
	testenv.Main(m)
}

const localTool = `PASEO_SSH=srv
PASEO_USER=dev
PASEO_DNS=srv.tail.test
PASEO_LISTEN_PORT=6767
PASEO_SERVE_PORT=8956
PASEO_URL=ssh://srv?daemonPort=6767
PASEO_VERSION=0.14.0
PASEO_AGENTS="codex claude"
PASEO_PASSWORD_FILE=%s
PASEO_UNIT=paseo.service
`

// session runs CLI commands and keeps everything they printed.
type session struct {
	t      *testing.T
	output bytes.Buffer
}

func (s *session) run(args ...string) (int, string, string) {
	s.t.Helper()
	var stdout, stderr bytes.Buffer
	code := run(args, strings.NewReader(""), &stdout, &stderr, false)
	if len(args) == 0 || args[0] != "password" {
		s.output.Write(stdout.Bytes())
	}
	s.output.Write(stderr.Bytes())
	return code, stdout.String(), stderr.String()
}

func (s *session) ok(args ...string) string {
	s.t.Helper()
	code, stdout, stderr := s.run(args...)
	if code != 0 {
		s.t.Fatalf("paseo-hosts %s: exit %d\n%s%s", strings.Join(args, " "), code, stdout, stderr)
	}
	return stdout
}

func (s *session) data(args ...string) map[string]any {
	s.t.Helper()
	var doc struct {
		SchemaVersion int            `json:"schema_version"`
		Command       string         `json:"command"`
		Result        string         `json:"result"`
		Data          map[string]any `json:"data"`
	}
	out := s.ok(append(args, "--json")...)
	if err := json.Unmarshal([]byte(out), &doc); err != nil || doc.Command != args[0] || doc.Result != "ok" {
		s.t.Fatalf("paseo-hosts %s --json: %v\n%s", strings.Join(args, " "), err, out)
	}
	return doc.Data
}

// assertNoPassword checks every stand-in's argument list and every stream.
func (s *session) assertNoPassword(e *testenv.Env, pw string) {
	s.t.Helper()
	if pw == "" {
		s.t.Fatal("no password to look for")
	}
	for _, c := range e.Calls() {
		if strings.Contains(strings.Join(c.Args, " "), pw) {
			s.t.Fatalf("%s on %q got the password as an argument", c.Name, c.Host)
		}
	}
	if strings.Contains(s.output.String(), pw) {
		s.t.Fatal("the output or the debug log holds the password")
	}
}

func TestOnlyTheDocumentedVariables(t *testing.T) {
	e := testenv.New(t)
	srv := e.Server("srv", testenv.ServerOptions{DNS: "srv.tail.test"})
	e.Trust(srv, "srv", true)
	mac := e.Client("mac", testenv.Darwin)
	t.Setenv("LOG_LEVEL", "debug")
	s := &session{t: t}

	code, _, stderr := s.run("link", "srv", "--no-app")
	if code != 3 || !strings.Contains(stderr, "PASEO_HOSTS_CLIENT") {
		t.Fatalf("link without a client alias: exit %d\n%s", code, stderr)
	}

	t.Setenv("PASEO_HOSTS_CLIENT", "mac")
	s.ok("onboard", "srv")
	runtimeDir := filepath.Join(e.Home, ".cache", "paseo-hosts", "runtime", "0.14.0")
	installs := e.CallsTo("npm")
	if !slices.ContainsFunc(installs, func(c testenv.Call) bool {
		return c.Host == "" && slices.Contains(c.Args, "install") && slices.Contains(c.Args, "@getpaseo/cli@0.14.0") &&
			strings.Contains(strings.Join(c.Args, " "), runtimeDir)
	}) {
		t.Fatalf("npm was not asked to install @getpaseo/cli@0.14.0 into %s: %v", runtimeDir, installs)
	}
	s.ok("link", "srv", "--no-app")
	if !strings.Contains(mac.Read(".ssh/config"), "Host paseo-srv") {
		t.Fatalf("mac ssh config:\n%s", mac.Read(".ssh/config"))
	}
	s.ok("verify", "srv")
	s.ok("status", "srv")
	s.ok("list")
	pw := strings.TrimSpace(s.ok("password", "srv"))
	s.ok("unlink", "srv", "--client", "mac")
	s.ok("remove", "srv")
	if _, err := os.Stat(registry.EnvPath(filepath.Join(e.Home, ".config", "paseo-hosts"), "srv")); !os.IsNotExist(err) {
		t.Fatalf("the registry file remains: %v", err)
	}

	for _, c := range e.CallsTo("ssh") {
		if c.Host == "" && !slices.Contains(c.Args, "srv") && !slices.Contains(c.Args, "mac") {
			t.Fatalf("an SSH command targets neither srv nor mac: %q", c.Args)
		}
	}
	if !strings.Contains(s.output.String(), "installing the local Paseo runtime") {
		t.Fatal("LOG_LEVEL=debug wrote no debug log")
	}
	s.assertNoPassword(e, pw)
}

func TestMissingNpmStopsBeforeAnyChange(t *testing.T) {
	e := testenv.New(t)
	e.Server("srv", testenv.ServerOptions{})
	e.RemoveTool("npm")
	s := &session{t: t}
	code, _, stderr := s.run("onboard", "srv")
	if code != 3 || !strings.Contains(stderr, "npm") {
		t.Fatalf("onboard without npm: exit %d\n%s", code, stderr)
	}
	if calls := e.CallsTo("ssh"); len(calls) != 0 {
		t.Fatalf("onboard contacted the server: %v", calls)
	}
}

func TestLocalToolRegistry(t *testing.T) {
	e := testenv.New(t)
	srv := e.Server("srv", testenv.ServerOptions{DNS: "srv.tail.test"})
	e.Trust(srv, "srv", true)
	mac := e.Client("mac", testenv.Darwin)
	s := &session{t: t}
	s.ok("onboard", "srv")
	dir := filepath.Join(e.Home, ".config", "paseo-hosts")
	if err := os.WriteFile(registry.EnvPath(dir, "srv"), []byte(strings.Replace(localTool, "%s", registry.PasswordPath(dir, "srv"), 1)), 0o600); err != nil {
		t.Fatal(err)
	}
	pw, err := registry.ReadPassword(dir, "srv")
	if err != nil {
		t.Fatal(err)
	}

	s.ok("verify", "srv")
	list := s.ok("list")
	if !strings.Contains(list, "srv") || !strings.Contains(list, "ssh://srv?daemonPort=6767") {
		t.Fatalf("list:\n%s", list)
	}
	s.ok("link", "srv", "--client", "mac", "--no-app")
	if cfg := mac.Read(".ssh/config"); !strings.Contains(cfg, "HostName srv.tail.test") || !strings.Contains(cfg, "Port 22\n") {
		t.Fatalf("the alias block does not use PASEO_DNS on port 22:\n%s", cfg)
	}
	if kh := mac.Read(".ssh/known_hosts"); !strings.HasPrefix(kh, "srv.tail.test ") {
		t.Fatalf("known_hosts:\n%s", kh)
	}

	human := s.ok("status", "srv")
	for _, want := range []string{"srv", "ssh-only", "6767", "ssh://srv?daemonPort=6767", "mac", "ssh://paseo-srv?daemonPort=6767", "codex claude"} {
		if !strings.Contains(human, want) {
			t.Fatalf("status does not show %q:\n%s", want, human)
		}
	}
	st := s.data("status", "srv")
	clients, _ := st["clients"].([]any)
	if st["alias"] != "srv" || st["ssh"] != "srv" || st["exposure"] != "ssh-only" || st["daemon_port"] != 6767.0 ||
		st["url"] != "ssh://srv?daemonPort=6767" || st["agents"] != "codex claude" || len(clients) != 1 {
		t.Fatalf("status --json: %v", st)
	}
	if c, _ := clients[0].(map[string]any); c["name"] != "mac" || c["remote_ssh"] != "ssh://paseo-srv?daemonPort=6767" {
		t.Fatalf("status --json clients: %v", clients)
	}
	var listed struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal([]byte(s.ok("list", "--json")), &listed); err != nil || len(listed.Data) != 1 ||
		listed.Data[0]["alias"] != "srv" || listed.Data[0]["ssh"] != "srv" || listed.Data[0]["url"] != "ssh://srv?daemonPort=6767" {
		t.Fatalf("list --json: %v %v", err, listed.Data)
	}

	s.ok("unlink", "srv", "--client", "mac")
	if strings.Contains(mac.Read(".ssh/config"), "paseo-srv") {
		t.Fatal("unlink left the alias block")
	}
	s.ok("remove", "srv")
	if _, err := os.Stat(registry.EnvPath(dir, "srv")); !os.IsNotExist(err) {
		t.Fatalf("the registry file remains: %v", err)
	}
	s.assertNoPassword(e, pw)
}
