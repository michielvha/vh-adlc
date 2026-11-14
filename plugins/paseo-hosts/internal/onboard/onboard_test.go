package onboard_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/config"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/onboard"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/registry"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/testenv"
)

func TestMain(m *testing.M) {
	onboard.RetryDelay = 10 * time.Millisecond
	testenv.Main(m)
}

func setup(t *testing.T) (*testenv.Env, *testenv.Host, config.Config) {
	e := testenv.New(t)
	srv := e.Server("srv", testenv.ServerOptions{DNS: "srv.tail.test"})
	cfg, err := config.Load(os.Getenv, config.Flags{})
	if err != nil {
		t.Fatal(err)
	}
	return e, srv, cfg
}

func run(t *testing.T, o onboard.Options) (*onboard.Result, error) {
	t.Helper()
	if o.Alias == "" {
		o.Alias = "srv"
	}
	var out bytes.Buffer
	o.Report = report.New(report.Options{Command: "onboard", Stdout: &out, Stderr: &out})
	res, err := onboard.Run(context.Background(), o)
	testenv.CheckReport(t, out.String())
	return res, err
}

func stateConfig(t *testing.T, srv *testenv.Host) map[string]any {
	t.Helper()
	var c map[string]any
	if err := json.Unmarshal([]byte(srv.Read(".local/share/paseo/state/config.json")), &c); err != nil {
		t.Fatal(err)
	}
	return c
}

func serveJSON(srv *testenv.Host) string {
	data, _ := os.ReadFile(filepath.Join(srv.Dir, "serve.json"))
	return string(data)
}

func mode(t *testing.T, path string) os.FileMode {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	return info.Mode().Perm()
}

func TestOnboardInstallsAnSSHOnlyDaemon(t *testing.T) {
	e, srv, cfg := setup(t)
	srv.Mark("serve.json", `{"TCP":{"8956":{"HTTPS":true},"443":{"HTTPS":true}},"Web":{"srv.tail.test:8956":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:6767"}}},"srv.tail.test:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:3000"}}}}}`)
	srv.Mark("daemon-503", "2")
	res, err := run(t, onboard.Options{Config: cfg})
	if err != nil {
		t.Fatal(err)
	}
	if res.URL != "ssh://srv?daemonPort=6767" || res.Exposure != "ssh-only" || !res.PasswordCreated {
		t.Fatalf("result %+v", res)
	}

	unit := srv.Read(".config/systemd/user/paseo.service")
	for _, want := range []string{"daemon run --home " + srv.Path(".local/share/paseo/state"), "ExecStart=" + e.Bin + "/node ", "PATH=" + srv.Bin + ":"} {
		if !strings.Contains(unit, want) {
			t.Fatalf("unit lacks %q:\n%s", want, unit)
		}
	}
	if !srv.Marked("systemd-enabled") {
		t.Fatal("paseo.service is not enabled")
	}
	c := stateConfig(t, srv)
	d := c["daemon"].(map[string]any)
	pw, err := registry.ReadPassword(cfg.Dir, "srv")
	if err != nil {
		t.Fatal(err)
	}
	if d["listen"] != "127.0.0.1:6767" || d["relay"].(map[string]any)["enabled"] != false || c["pluginsEnabled"] != false {
		t.Fatalf("daemon config %v", c)
	}
	if got := d["hostnames"]; !slices.Equal(toStrings(got), []string{"localhost", "127.0.0.1", "srv.tail.test"}) {
		t.Fatalf("hostnames %v", got)
	}
	if d["auth"].(map[string]any)["password"] != testenv.FakeHash(pw) {
		t.Fatal("config does not hold the password hash")
	}
	assertNotOnServer(t, srv, pw)
	for _, c := range e.Calls() {
		if strings.Contains(strings.Join(c.Args, " "), pw) {
			t.Fatalf("password in the arguments of %s", c.Name)
		}
	}

	if s := serveJSON(srv); strings.Contains(s, "127.0.0.1:6767") || !strings.Contains(s, "127.0.0.1:3000") {
		t.Fatalf("serve config %s", s)
	}
	if mode(t, cfg.Dir) != 0o700 || mode(t, registry.PasswordPath(cfg.Dir, "srv")) != 0o600 || mode(t, registry.EnvPath(cfg.Dir, "srv")) != 0o600 {
		t.Fatal("registry modes")
	}
	entry, err := registry.Load(cfg.Dir, "srv")
	if err != nil {
		t.Fatal(err)
	}
	if entry.Published || entry.ListenPort != 6767 || entry.ClientHost != "srv.tail.test" || entry.ClientPort != 22 || entry.User != "dev" || entry.Agents != "codex claude" {
		t.Fatalf("registry %+v", entry)
	}

	res, err = run(t, onboard.Options{Config: cfg})
	if err != nil {
		t.Fatal(err)
	}
	again, _ := registry.ReadPassword(cfg.Dir, "srv")
	if res.PasswordCreated || again != pw {
		t.Fatal("re-run replaced the password")
	}
	units, _ := filepath.Glob(srv.Path(".config/systemd/user/*.service"))
	if len(units) != 1 {
		t.Fatalf("units %v", units)
	}
}

func TestPublishAddsOneRouteAndARerunRemovesIt(t *testing.T) {
	e, srv, cfg := setup(t)
	res, err := run(t, onboard.Options{Config: cfg, Publish: true})
	if err != nil {
		t.Fatal(err)
	}
	if res.URL != "wss://srv.tail.test:8956" || res.Exposure != "tailnet" {
		t.Fatalf("result %+v", res)
	}
	if _, err := run(t, onboard.Options{Config: cfg, Publish: true}); err != nil {
		t.Fatal(err)
	}
	if s := serveJSON(srv); strings.Count(s, "127.0.0.1:6767") != 1 || !strings.Contains(s, `"srv.tail.test:8956"`) {
		t.Fatalf("serve config %s", s)
	}
	health := false
	for _, c := range e.CallsTo("curl") {
		health = health || (c.Host == "" && slices.Contains(c.Args, "https://srv.tail.test:8956/api/health"))
	}
	if !health {
		t.Fatal("no HTTPS health check from the operator host")
	}
	if _, err := run(t, onboard.Options{Config: cfg}); err != nil {
		t.Fatal(err)
	}
	if s := serveJSON(srv); strings.Contains(s, "127.0.0.1:6767") {
		t.Fatalf("route kept: %s", s)
	}
	entry, _ := registry.Load(cfg.Dir, "srv")
	if entry.Published || entry.URL != "ssh://srv?daemonPort=6767" {
		t.Fatalf("registry %+v", entry)
	}

	srv.Mark("serve.json", `{"TCP":{"8956":{"HTTPS":true}},"Web":{"srv.tail.test:8956":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:3000"}}}}}`)
	if _, err := run(t, onboard.Options{Config: cfg, Publish: true}); report.Code(err) != report.ExitFailed || !strings.Contains(err.Error(), "8956") {
		t.Fatalf("a Serve port used by another route must fail, got %v", err)
	}
}

const localTool = `PASEO_SSH=srv
PASEO_USER=dev
PASEO_DNS=srv.tail.test
PASEO_LISTEN_PORT=6867
PASEO_SERVE_PORT=8956
PASEO_URL=ssh://srv?daemonPort=6867
PASEO_VERSION=0.14.0
PASEO_AGENTS="codex claude"
PASEO_PASSWORD_FILE=%s
PASEO_UNIT=paseo.service
PASEO_CLIENTS=mac
`

func TestRerunKeepsALocalToolRegistry(t *testing.T) {
	e, srv, cfg := setup(t)
	if err := registry.EnsureDir(cfg.Dir); err != nil {
		t.Fatal(err)
	}
	pwFile := registry.PasswordPath(cfg.Dir, "srv")
	if err := os.WriteFile(registry.EnvPath(cfg.Dir, "srv"), []byte(strings.Replace(localTool, "%s", pwFile, 1)), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(pwFile, []byte("local-tool-password\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	res, err := run(t, onboard.Options{Config: cfg, ClientHost: "srv.example.test"})
	if err != nil {
		t.Fatal(err)
	}
	if res.PasswordCreated || res.DaemonPort != 6867 || !slices.Equal(res.Relink, []string{"mac"}) {
		t.Fatalf("result %+v", res)
	}
	if activePort, _ := os.ReadFile(filepath.Join(srv.Dir, "systemd-active")); string(activePort) != "6867" {
		t.Fatalf("daemon port %s", activePort)
	}
	entry, err := registry.Load(cfg.Dir, "srv")
	if err != nil {
		t.Fatal(err)
	}
	if entry.ListenPort != 6867 || !slices.Equal(entry.Clients, []string{"mac"}) || entry.ClientHost != "srv.example.test" || entry.ClientPort != 22 {
		t.Fatalf("registry %+v", entry)
	}
	if pw, _ := registry.ReadPassword(cfg.Dir, "srv"); pw != "local-tool-password" {
		t.Fatal("password changed")
	}

	before, _ := os.ReadFile(registry.EnvPath(cfg.Dir, "srv"))
	calls := len(e.Calls())
	_, err = run(t, onboard.Options{Config: cfg, ListenPortFlag: 7000})
	if report.Code(err) != report.ExitUsage {
		t.Fatalf("a different --listen-port must exit 2, got %v", err)
	}
	after, _ := os.ReadFile(registry.EnvPath(cfg.Dir, "srv"))
	if string(after) != string(before) || len(e.Calls()) != calls {
		t.Fatal("a refused --listen-port changed something")
	}
}

func TestVerificationFailsWhenTheDaemonAcceptsNoPassword(t *testing.T) {
	_, srv, cfg := setup(t)
	srv.Mark("daemon-accepts-anyone", "")
	_, err := run(t, onboard.Options{Config: cfg})
	if report.Code(err) != report.ExitFailed || !strings.Contains(err.Error(), "without a password") {
		t.Fatalf("want a failed check, got %v", err)
	}
}

func toStrings(v any) []string {
	var out []string
	list, _ := v.([]any)
	for _, s := range list {
		str, _ := s.(string)
		out = append(out, str)
	}
	return out
}

func assertNotOnServer(t *testing.T, srv *testenv.Host, pw string) {
	t.Helper()
	err := filepath.WalkDir(srv.Dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || d.Type()&fs.ModeSymlink != 0 {
			return err
		}
		data, err := os.ReadFile(p)
		if err == nil && strings.Contains(string(data), pw) {
			t.Errorf("plaintext password in %s", p)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
