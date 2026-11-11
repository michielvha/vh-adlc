package link_test

import (
	"bytes"
	"context"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/config"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/link"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/registry"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/remote"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/testenv"
)

func TestMain(m *testing.M) { testenv.Main(m) }

type world struct {
	e   *testenv.Env
	srv *testenv.Host
	cfg config.Config
	pw  string
}

// onboarded registers srv as an onboarded server with a running daemon.
func onboarded(t *testing.T, o testenv.ServerOptions, clientHost string, clientPort int) *world {
	t.Helper()
	e := testenv.New(t)
	srv := e.Server("srv", o)
	cfg, err := config.Load(os.Getenv, config.Flags{})
	if err != nil {
		t.Fatal(err)
	}
	if err := registry.EnsureDir(cfg.Dir); err != nil {
		t.Fatal(err)
	}
	pw, _, err := registry.EnsurePassword(cfg.Dir, "srv")
	if err != nil {
		t.Fatal(err)
	}
	entry := &registry.Entry{
		Alias: "srv", SSH: "srv", User: "dev", DNS: o.DNS, ListenPort: 6767, ServePort: 8956,
		URL: "ssh://srv?daemonPort=6767", Version: "0.14.0", Agents: "codex claude",
		PasswordFile: registry.PasswordPath(cfg.Dir, "srv"), Unit: "paseo.service",
		ClientHost: clientHost, ClientPort: clientPort,
	}
	if err := entry.Save(cfg.Dir); err != nil {
		t.Fatal(err)
	}
	srv.Mark("systemd-active", "6767")
	srv.Write(".ssh/authorized_keys", "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOtherKeyOfTheOwner owner@laptop\n", 0o600)
	return &world{e: e, srv: srv, cfg: cfg, pw: pw}
}

type appCall struct {
	client   link.Client
	password string
}

func (w *world) link(t *testing.T, client string, noApp bool, calls *[]appCall) (string, error) {
	t.Helper()
	var out bytes.Buffer
	_, err := link.Run(context.Background(), link.Options{
		Alias: "srv", Client: client, Config: w.cfg, NoApp: noApp,
		Report: report.New(report.Options{Command: "link", Stdout: &out, Stderr: &out}),
		App: func(_ context.Context, c link.Client, _ *registry.Entry, password string) error {
			*calls = append(*calls, appCall{c, password})
			return nil
		},
	})
	if strings.Contains(out.String(), w.pw) {
		t.Fatal("link printed the password")
	}
	testenv.CheckReport(t, out.String())
	return out.String(), err
}

func keyLines(t *testing.T, srv *testenv.Host, client string) []string {
	t.Helper()
	var lines []string
	for _, l := range strings.Split(srv.Read(".ssh/authorized_keys"), "\n") {
		if strings.HasSuffix(l, " paseo-hosts:"+client) {
			lines = append(lines, l)
		}
	}
	return lines
}

// fromClient runs a shell command on a Unix client, as the client's user.
func fromClient(t *testing.T, client, command string) string {
	t.Helper()
	out, _ := remote.Bash(context.Background(), client, command, nil)
	return out.Text
}

func assertSSHAccess(t *testing.T, w *world, client *testenv.Host) {
	t.Helper()
	lines := keyLines(t, w.srv, client.Name)
	if len(lines) != 1 || !strings.HasPrefix(lines[0], `restrict,port-forwarding,permitopen="127.0.0.1:6767",permitlisten="127.0.0.1:1",command="/bin/false" ssh-ed25519 `) {
		t.Fatalf("authorized_keys lines for %s: %q", client.Name, lines)
	}
	if !strings.Contains(w.srv.Read(".ssh/authorized_keys"), "owner@laptop") {
		t.Fatal("an unrelated authorized_keys line was removed")
	}
	cfg := client.Read(".ssh/config")
	if strings.Count(cfg, "# BEGIN paseo-hosts paseo-srv") != 1 || strings.Count(cfg, "# END paseo-hosts paseo-srv") != 1 || strings.Contains(cfg, "paseo-host paseo-srv") {
		t.Fatalf("client ssh config:\n%s", cfg)
	}
	for _, want := range []string{"IdentitiesOnly yes", "StrictHostKeyChecking yes", "Host other"} {
		if !strings.Contains(cfg, want) {
			t.Fatalf("client ssh config lacks %q:\n%s", want, cfg)
		}
	}
}

const oldConfig = `Host other
  HostName other.example

# BEGIN paseo-host paseo-srv
Host paseo-srv
  HostName old.example
# END paseo-host paseo-srv
`

func TestLinkMacTwiceKeepsOneKeyLineAndOneBlock(t *testing.T) {
	w := onboarded(t, testenv.ServerOptions{DNS: "srv.tail.test"}, "srv.tail.test", 22)
	mac := w.e.Client("mac", testenv.Darwin)
	mac.Write(".ssh/config", oldConfig, 0o600)
	w.e.Trust(w.srv, "srv", true)
	var app []appCall
	for range 2 {
		if _, err := w.link(t, "mac", true, &app); err != nil {
			t.Fatal(err)
		}
	}
	assertSSHAccess(t, w, mac)
	kh := mac.Read(".ssh/known_hosts")
	if strings.Count(kh, "srv.tail.test "+w.srv.HostKey()) != 1 {
		t.Fatalf("client known_hosts:\n%s", kh)
	}
	if got := fromClient(t, "mac", `printf 'GET /api/health HTTP/1.0\r\n\r\n' | ssh -o BatchMode=yes -W 127.0.0.1:6767 paseo-srv | head -1`); !strings.Contains(got, " 200") {
		t.Fatalf("tunnel answered %q", got)
	}
	if got := fromClient(t, "mac", `ssh -o BatchMode=yes paseo-srv true && echo SHELL; ssh -o BatchMode=yes -W 127.0.0.1:22 paseo-srv </dev/null && echo FORWARD; true`); got != "" {
		t.Fatalf("the tunnel key was allowed: %q", got)
	}
	entry, _ := registry.Load(w.cfg.Dir, "srv")
	if !slices.Equal(entry.Clients, []string{"mac"}) {
		t.Fatalf("clients %v", entry.Clients)
	}
	if len(app) != 0 {
		t.Fatal("--no-app reached the desktop app step")
	}
	for _, name := range []string{"open", "osascript", "pgrep", "pkill", "pbcopy"} {
		if calls := w.e.CallsTo(name); len(calls) != 0 {
			t.Fatalf("--no-app ran %s %v", name, calls[0].Args)
		}
	}
	for _, c := range w.e.Calls() {
		if strings.Contains(strings.Join(c.Args, " "), w.pw) {
			t.Fatalf("password in the arguments of %s", c.Name)
		}
	}

	mac.Write("Applications/Paseo.app/Contents/MacOS/Paseo", "", 0o755)
	if _, err := w.link(t, "mac", false, &app); err != nil {
		t.Fatal(err)
	}
	if len(app) != 1 || app[0].password != w.pw || app[0].client.Kind != testenv.Darwin || app[0].client.Alias != "mac" {
		t.Fatalf("app step calls %+v", app)
	}
	assertSSHAccess(t, w, mac)
}

func TestLinkWindowsTwiceKeepsOneKeyLineAndOneBlock(t *testing.T) {
	testenv.RequirePwsh(t)
	w := onboarded(t, testenv.ServerOptions{DNS: "srv.tail.test"}, "srv.tail.test", 22)
	pc := w.e.Client("pc", testenv.Windows)
	pc.Mark("git-unix-tools", "")
	pc.Write(".ssh/config", oldConfig, 0o600)
	w.e.Trust(w.srv, "srv", false)
	var app []appCall
	for range 2 {
		if _, err := w.link(t, "pc", true, &app); err != nil {
			t.Fatal(err)
		}
	}
	assertSSHAccess(t, w, pc)
	kh := pc.Read(".ssh/known_hosts")
	if strings.Count(kh, "srv.tail.test "+w.srv.HostKey()) != 1 {
		t.Fatalf("client known_hosts:\n%s", kh)
	}
	for _, f := range []string{".ssh/config", ".ssh/known_hosts"} {
		if strings.HasPrefix(pc.Read(f), "\ufeff") {
			t.Fatalf("%s starts with a byte order mark", f)
		}
	}
	acl, _ := os.ReadFile(pc.Dir + "/icacls.log")
	if !strings.Contains(string(acl), "id_ed25519_paseo /inheritance:r") {
		t.Fatalf("private key ACL not restricted: %q", acl)
	}
	if len(app) != 0 {
		t.Fatal("--no-app reached the desktop app step")
	}
}

func TestHostKeysForAClientHostAndPort2222(t *testing.T) {
	w := onboarded(t, testenv.ServerOptions{SSHPort: 2222}, "srv.example.test", 2222)
	w.srv.Alias("srv.example.test")
	mac := w.e.Client("mac", testenv.Darwin)
	w.e.Trust(w.srv, "[srv]:2222", true)
	var app []appCall
	if _, err := w.link(t, "mac", true, &app); err != nil {
		t.Fatal(err)
	}
	if kh := mac.Read(".ssh/known_hosts"); !strings.Contains(kh, "[srv.example.test]:2222 "+w.srv.HostKey()) {
		t.Fatalf("client known_hosts:\n%s", kh)
	}
	cfg := mac.Read(".ssh/config")
	if !strings.Contains(cfg, "HostName srv.example.test") || !strings.Contains(cfg, "Port 2222") {
		t.Fatalf("client ssh config:\n%s", cfg)
	}
}

func TestProbeStopsBeforeAnyChange(t *testing.T) {
	cases := []struct {
		name  string
		setup func(w *world)
		noApp bool
		code  int
		msg   string
	}{
		{"no operator host key", func(w *world) { w.e.Client("mac", testenv.Darwin) }, true, report.ExitFailed, "ssh srv"},
		{"no desktop app", func(w *world) {
			w.e.Client("mac", testenv.Darwin)
			w.e.Trust(w.srv, "srv", false)
		}, false, report.ExitFailed, "Paseo app"},
		{"unsupported client", func(w *world) {
			w.e.Client("mac", testenv.Linux)
			w.e.Trust(w.srv, "srv", false)
		}, true, report.ExitUnsupported, "mac"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := onboarded(t, testenv.ServerOptions{DNS: "srv.tail.test"}, "srv.tail.test", 22)
			tc.setup(w)
			before := w.srv.Read(".ssh/authorized_keys")
			var app []appCall
			_, err := w.link(t, "mac", tc.noApp, &app)
			if report.Code(err) != tc.code || !strings.Contains(err.Error(), tc.msg) {
				t.Fatalf("want exit %d naming %q, got %d: %v", tc.code, tc.msg, report.Code(err), err)
			}
			entry, _ := registry.Load(w.cfg.Dir, "srv")
			if len(entry.Clients) != 0 || w.srv.Read(".ssh/authorized_keys") != before {
				t.Fatal("the probe changed the registry or the server")
			}
			if _, err := os.Stat(w.e.Root + "/hosts/mac/home/.ssh"); err == nil {
				t.Fatal("the probe changed the client")
			}
			for _, c := range w.e.CallsTo("ssh-keygen") {
				if c.Host == "mac" {
					t.Fatalf("the probe ran ssh-keygen on the client: %v", c.Args)
				}
			}
		})
	}
}
