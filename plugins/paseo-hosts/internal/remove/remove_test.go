package remove_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/clientapp"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/config"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/link"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/registry"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/remote"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/remove"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/testenv"
)

func TestMain(m *testing.M) { testenv.Main(m) }

const (
	appFile   = ".paseo-app.json"
	otherHost = `{"serverId":"srv_other","password":"other-secret","connections":[{"type":"remoteSsh","host":"paseo-other"}]}`
	ownerLine = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOtherKeyOfTheOwner owner@laptop"
	otherSSH  = "Host other\n  HostName other.example\n"
)

// stubApp keeps each client's desktop app host list in a file in the
// client's home; the clientapp tests cover the app itself.
type stubApp struct {
	e          *testenv.Env
	failDelete map[string]int
	deletes    []string
}

func (s *stubApp) path(client string) string {
	return filepath.Join(s.e.Root, "hosts", client, "home", appFile)
}

func (s *stubApp) read(client string) []json.RawMessage {
	var hosts []json.RawMessage
	if data, err := os.ReadFile(s.path(client)); err == nil {
		_ = json.Unmarshal(data, &hosts)
	}
	return hosts
}

func (s *stubApp) write(client string, hosts []json.RawMessage) error {
	data, err := json.Marshal(hosts)
	if err != nil {
		return err
	}
	return os.WriteFile(s.path(client), data, 0o600)
}

func (s *stubApp) Add(_ context.Context, c link.Client, e *registry.Entry, password string) error {
	id := "srv_" + e.Alias
	hosts := slices.DeleteFunc(s.read(c.Alias), func(raw json.RawMessage) bool { return clientapp.Matches(raw, id, "") })
	entry, _ := json.Marshal(map[string]any{
		"serverId": id, "password": password,
		"connections": []any{clientapp.Connection(link.SSHAlias(e.Alias), e.ListenPort)},
	})
	return s.write(c.Alias, append(hosts, entry))
}

func (s *stubApp) ServerID(_ context.Context, e *registry.Entry, _ string) (string, error) {
	if _, err := os.Stat(filepath.Join(s.e.Root, "hosts", e.SSH, "unreachable")); err == nil {
		return "", errors.New("the daemon does not answer")
	}
	return "srv_" + e.Alias, nil
}

func (s *stubApp) Delete(_ context.Context, c link.Client, alias, serverID string) error {
	s.deletes = append(s.deletes, c.Alias+" "+serverID)
	if s.failDelete[c.Alias] > 0 {
		s.failDelete[c.Alias]--
		return report.Errorf(report.ExitFailed, "the app on %s did not keep the change", c.Alias)
	}
	host := link.SSHAlias(alias)
	return s.write(c.Alias, slices.DeleteFunc(s.read(c.Alias), func(raw json.RawMessage) bool { return clientapp.Matches(raw, serverID, host) }))
}

func (s *stubApp) listsSrv(client string) bool {
	return slices.ContainsFunc(s.read(client), func(raw json.RawMessage) bool { return clientapp.Matches(raw, "srv_srv", "paseo-srv") })
}

type world struct {
	e   *testenv.Env
	srv *testenv.Host
	cfg config.Config
	pw  string
	app *stubApp
}

// onboarded registers srv as an onboarded server with a published daemon,
// and a second server that remove must leave alone.
func onboarded(t *testing.T) *world {
	t.Helper()
	e := testenv.New(t)
	srv := e.Server("srv", testenv.ServerOptions{DNS: "srv.tail.test"})
	e.Trust(srv, "srv", true)
	cfg, err := config.Load(os.Getenv, config.Flags{})
	if err != nil {
		t.Fatal(err)
	}
	if err := registry.EnsureDir(cfg.Dir); err != nil {
		t.Fatal(err)
	}
	var pw string
	for _, alias := range []string{"srv", "other"} {
		p, _, err := registry.EnsurePassword(cfg.Dir, alias)
		if err != nil {
			t.Fatal(err)
		}
		if alias == "srv" {
			pw = p
		}
		entry := &registry.Entry{
			Alias: alias, SSH: alias, User: "dev", DNS: alias + ".tail.test", ListenPort: 6767, ServePort: 8956, Published: alias == "srv",
			URL: "ssh://" + alias + "?daemonPort=6767", Version: "0.14.0", Agents: "codex claude",
			PasswordFile: registry.PasswordPath(cfg.Dir, alias), Unit: "paseo.service", ClientHost: alias + ".tail.test", ClientPort: 22,
		}
		if err := entry.Save(cfg.Dir); err != nil {
			t.Fatal(err)
		}
	}
	srv.Write(".ssh/authorized_keys", ownerLine+"\n", 0o600)
	srv.Write(".config/systemd/user/paseo.service", "[Service]\n", 0o644)
	srv.Write(".local/share/paseo/state/config.json", `{"daemon":{"listen":"127.0.0.1:6767","auth":{"password":"`+testenv.FakeHash(pw)+`"}}}`, 0o600)
	srv.Write(".local/share/paseo/state/agents.json", "{}", 0o600)
	srv.Write(".local/share/paseo/runtime/node_modules/.package-lock.json", "{}", 0o644)
	srv.Write(".local/share/paseo/workspace/notes.md", "notes\n", 0o644)
	srv.Mark("systemd-active", "6767")
	srv.Mark("systemd-enabled", "")
	if _, err := remote.Bash(context.Background(), "srv", "tailscale serve --bg --https=8956 http://127.0.0.1:6767", nil); err != nil {
		t.Fatal(err)
	}
	return &world{e: e, srv: srv, cfg: cfg, pw: pw, app: &stubApp{e: e, failDelete: map[string]int{}}}
}

// client adds a Mac that already lists another server in its app and its
// SSH config.
func (w *world) client(t *testing.T, name string, app bool) *testenv.Host {
	t.Helper()
	h := w.e.Client(name, testenv.Darwin)
	if app {
		h.Write("Applications/Paseo.app/Contents/MacOS/Paseo", "", 0o755)
	}
	h.Write(appFile, "["+otherHost+"]", 0o600)
	h.Write(".ssh/config", otherSSH, 0o600)
	return h
}

func (w *world) link(t *testing.T, client string, noApp bool) {
	t.Helper()
	var out bytes.Buffer
	if _, err := link.Run(context.Background(), link.Options{
		Alias: "srv", Client: client, Config: w.cfg, NoApp: noApp, App: w.app.Add,
		Report: report.New(report.Options{Command: "link", Stdout: &out, Stderr: &out}),
	}); err != nil {
		t.Fatalf("link %s: %v\n%s", client, err, out.String())
	}
}

func (w *world) run(t *testing.T, unlink bool, o remove.Options) (string, error) {
	t.Helper()
	var out bytes.Buffer
	o.Alias, o.Config, o.App = "srv", w.cfg, w.app
	o.Report = report.New(report.Options{Command: "remove", Stdout: &out, Stderr: &out})
	var err error
	if unlink {
		_, err = remove.Unlink(context.Background(), o)
	} else {
		_, err = remove.Remove(context.Background(), o)
	}
	if strings.Contains(out.String(), w.pw) {
		t.Fatal("the output holds the password")
	}
	return out.String(), err
}

func (w *world) tunnelLines() []string {
	var lines []string
	for _, l := range strings.Split(w.srv.Read(".ssh/authorized_keys"), "\n") {
		if strings.Contains(l, `permitopen="127.0.0.1:6767"`) && strings.Contains(l, `command="/bin/false"`) {
			lines = append(lines, l)
		}
	}
	return lines
}

func (w *world) clients(t *testing.T) []string {
	t.Helper()
	entry, err := registry.Load(w.cfg.Dir, "srv")
	if err != nil {
		t.Fatal(err)
	}
	return entry.Clients
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func (w *world) serverExists() bool {
	return exists(w.srv.Path(".config/systemd/user/paseo.service"))
}

func (w *world) registryExists() bool {
	return exists(registry.EnvPath(w.cfg.Dir, "srv")) || exists(registry.PasswordPath(w.cfg.Dir, "srv"))
}

// assertClientUnlinked checks that a client lost the server and kept the
// rest of its app and SSH config.
func (w *world) assertClientUnlinked(t *testing.T, h *testenv.Host) {
	t.Helper()
	if w.app.listsSrv(h.Name) || !strings.Contains(h.Read(appFile), "srv_other") {
		t.Fatalf("the app on %s: %s", h.Name, h.Read(appFile))
	}
	cfg := h.Read(".ssh/config")
	if strings.Contains(cfg, "paseo-srv") || !strings.Contains(cfg, "Host other") {
		t.Fatalf("%s ssh config:\n%s", h.Name, cfg)
	}
}

func (w *world) assertRemoved(t *testing.T, purge bool) {
	t.Helper()
	if lines := w.tunnelLines(); len(lines) != 0 {
		t.Fatalf("tunnel-only lines remain: %q", lines)
	}
	if !strings.Contains(w.srv.Read(".ssh/authorized_keys"), ownerLine) {
		t.Fatal("an unrelated authorized_keys line was removed")
	}
	if w.serverExists() || w.srv.Marked("systemd-active") || w.srv.Marked("systemd-enabled") {
		t.Fatal("paseo.service remains")
	}
	if serve, _ := os.ReadFile(filepath.Join(w.srv.Dir, "serve.json")); strings.Contains(string(serve), "127.0.0.1:6767") {
		t.Fatalf("a Serve route points at the daemon: %s", serve)
	}
	for _, gone := range []string{".local/share/paseo/runtime", ".local/share/paseo/state/config.json"} {
		if exists(w.srv.Path(gone)) {
			t.Fatalf("%s remains", gone)
		}
	}
	kept := exists(w.srv.Path(".local/share/paseo/state/agents.json")) && exists(w.srv.Path(".local/share/paseo/workspace/notes.md"))
	if purge && exists(w.srv.Path(".local/share/paseo")) {
		t.Fatal("--purge left ~/.local/share/paseo")
	}
	if !purge && !kept {
		t.Fatal("remove without --purge deleted the state or workspace")
	}
	if w.registryExists() {
		t.Fatal("the registry files remain")
	}
	if !exists(registry.EnvPath(w.cfg.Dir, "other")) || !exists(registry.PasswordPath(w.cfg.Dir, "other")) {
		t.Fatal("another server's registry files were removed")
	}
	backups, _ := filepath.Glob(filepath.Join(w.cfg.Dir, "*backup.json"))
	for _, b := range backups {
		if data, _ := os.ReadFile(b); strings.Contains(string(data), w.pw) || strings.Contains(string(data), "paseo-srv") {
			t.Fatalf("%s holds the server's entry: %s", b, data)
		}
	}
}

func TestRemoveTwoClients(t *testing.T) {
	for _, purge := range []bool{false, true} {
		name := "keep state"
		if purge {
			name = "purge"
		}
		t.Run(name, func(t *testing.T) {
			w := onboarded(t)
			mac, mac2 := w.client(t, "mac", true), w.client(t, "mac2", true)
			w.link(t, "mac", false)
			w.link(t, "mac2", false)
			if err := os.WriteFile(filepath.Join(w.cfg.Dir, "app-registry-mac.backup.json"), []byte("["+otherHost+","+string(w.app.read("mac")[1])+"]"), 0o600); err != nil {
				t.Fatal(err)
			}
			if _, err := w.run(t, false, remove.Options{Purge: purge}); err != nil {
				t.Fatal(err)
			}
			w.assertClientUnlinked(t, mac)
			w.assertClientUnlinked(t, mac2)
			w.assertRemoved(t, purge)
		})
	}
}

func TestRemoveFailurePartWayThenRerun(t *testing.T) {
	w := onboarded(t)
	mac, mac2 := w.client(t, "mac", true), w.client(t, "mac2", true)
	w.link(t, "mac", false)
	w.link(t, "mac2", false)
	w.app.failDelete["mac2"] = 1
	if _, err := w.run(t, false, remove.Options{}); err == nil {
		t.Fatal("remove succeeded while an app step failed")
	}
	if !slices.Equal(w.clients(t), []string{"mac2"}) || !w.serverExists() {
		t.Fatalf("after the failure: clients %v, server kept %v", w.clients(t), w.serverExists())
	}
	if _, err := w.run(t, false, remove.Options{}); err != nil {
		t.Fatal(err)
	}
	w.assertClientUnlinked(t, mac)
	w.assertClientUnlinked(t, mac2)
	w.assertRemoved(t, false)
}

func TestUnlinkOneClientAndBackups(t *testing.T) {
	w := onboarded(t)
	mac, mac2 := w.client(t, "mac", true), w.client(t, "mac2", false)
	w.link(t, "mac", false)
	w.link(t, "mac2", true)
	srvEntry := w.app.read("mac")[1]
	legacy := `{"serverId":"srv_legacy","password":"` + w.pw + `","connections":[{"type":"remoteSsh","host":"paseo-srv"}]}`
	backups := map[string]string{
		"app-registry-mac.backup.json":  "[" + otherHost + "," + string(srvEntry) + "]",
		"app-registry-mac2.backup.json": "[" + otherHost + "]",
		"mac-app-registry.backup.json":  "[" + legacy + "," + otherHost + "]",
	}
	for name, data := range backups {
		if err := os.WriteFile(filepath.Join(w.cfg.Dir, name), []byte(data), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	mac2Config := mac2.Read(".ssh/config")

	if _, err := w.run(t, true, remove.Options{Clients: []string{"mac"}}); err != nil {
		t.Fatal(err)
	}
	w.assertClientUnlinked(t, mac)
	if lines := w.tunnelLines(); len(lines) != 1 || !strings.HasSuffix(lines[0], " paseo-hosts:mac2") {
		t.Fatalf("tunnel-only lines after unlinking mac: %q", lines)
	}
	if mac2.Read(".ssh/config") != mac2Config || !slices.Equal(w.clients(t), []string{"mac2"}) {
		t.Fatal("unlink changed another client")
	}
	for name := range backups {
		data, err := os.ReadFile(filepath.Join(w.cfg.Dir, name))
		if err != nil {
			t.Fatal(err)
		}
		var hosts []json.RawMessage
		if err := json.Unmarshal(data, &hosts); err != nil || len(hosts) != 1 || !clientapp.Matches(hosts[0], "srv_other", "") {
			t.Fatalf("%s after unlink: %s", name, data)
		}
	}

	// AC-15: a client without the app loses its block and key line.
	if _, err := w.run(t, true, remove.Options{Clients: []string{"mac2"}}); err != nil {
		t.Fatal(err)
	}
	if slices.ContainsFunc(w.app.deletes, func(d string) bool { return strings.HasPrefix(d, "mac2 ") }) {
		t.Fatal("unlink ran the app step on a client without the app")
	}
	if strings.Contains(mac2.Read(".ssh/config"), "paseo-srv") || len(w.tunnelLines()) != 0 || len(w.clients(t)) != 0 {
		t.Fatalf("after unlinking mac2: lines %q, clients %v", w.tunnelLines(), w.clients(t))
	}
	if !w.serverExists() || !w.registryExists() {
		t.Fatal("unlink removed the server")
	}
}

func TestUnlinkServerOnly(t *testing.T) {
	w := onboarded(t)
	entry, _ := registry.Load(w.cfg.Dir, "srv")
	entry.AddClient("gone")
	if err := entry.Save(w.cfg.Dir); err != nil {
		t.Fatal(err)
	}
	if _, err := w.run(t, true, remove.Options{Clients: []string{"gone"}, ServerOnly: true}); err != nil {
		t.Fatal(err)
	}
	if len(w.clients(t)) != 0 {
		t.Fatalf("clients %v", w.clients(t))
	}

	legacy := `restrict,port-forwarding,permitopen="127.0.0.1:6767",command="/bin/false" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILegacyMacKey paseo@mac`
	w.srv.Write(".ssh/authorized_keys", ownerLine+"\n"+legacy+"\n", 0o600)
	keys, env := w.srv.Read(".ssh/authorized_keys"), mustRead(t, registry.EnvPath(w.cfg.Dir, "srv"))
	_, err := w.run(t, true, remove.Options{Clients: []string{"mac"}, ServerOnly: true})
	if report.Code(err) != report.ExitFailed || !strings.Contains(err.Error(), "paseo@mac") {
		t.Fatalf("want exit 1 naming paseo@mac, got %d: %v", report.Code(err), err)
	}
	if w.srv.Read(".ssh/authorized_keys") != keys || mustRead(t, registry.EnvPath(w.cfg.Dir, "srv")) != env {
		t.Fatal("a refused unlink --server-only changed something")
	}
}

func mustRead(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestRemoveSkipServer(t *testing.T) {
	w := onboarded(t)
	mac, mac2 := w.client(t, "mac", true), w.client(t, "mac2", true)
	w.link(t, "mac", false)
	w.link(t, "mac2", false)
	w.srv.Mark("unreachable", "")
	mac2.Mark("unreachable", "")
	app2, cfg2 := mac2.Read(appFile), mac2.Read(".ssh/config")
	out, err := w.run(t, false, remove.Options{SkipServer: true})
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(w.app.deletes, []string{"mac "}) {
		t.Fatalf("app deletes %q, want mac matched by connection host only", w.app.deletes)
	}
	w.assertClientUnlinked(t, mac)
	if mac2.Read(appFile) != app2 || mac2.Read(".ssh/config") != cfg2 || !strings.Contains(out, "mac2") {
		t.Fatalf("the unreachable client was changed or not reported:\n%s", out)
	}
	if w.registryExists() {
		t.Fatal("the registry files remain")
	}
}

func TestRemoveSkipServerNeedsClientsOrNoClients(t *testing.T) {
	w := onboarded(t)
	w.srv.Mark("unreachable", "")
	if _, err := w.run(t, false, remove.Options{SkipServer: true}); report.Code(err) != report.ExitConfig || !strings.Contains(err.Error(), "--no-clients") {
		t.Fatalf("want exit 3 naming --no-clients, got %d: %v", report.Code(err), err)
	}
	if !w.registryExists() {
		t.Fatal("a refused remove deleted the registry")
	}
	if _, err := w.run(t, false, remove.Options{SkipServer: true, NoClients: true}); err != nil {
		t.Fatal(err)
	}
	if w.registryExists() {
		t.Fatal("the registry files remain")
	}
}

func TestRemoveStopsAtAnUnreachableClient(t *testing.T) {
	w := onboarded(t)
	mac, mac2 := w.client(t, "mac", true), w.client(t, "mac2", true)
	w.link(t, "mac", false)
	w.link(t, "mac2", false)
	mac2.Mark("unreachable", "")
	app2, cfg2 := mac2.Read(appFile), mac2.Read(".ssh/config")
	_, err := w.run(t, false, remove.Options{})
	if err == nil || !strings.Contains(err.Error(), "unlink srv --client mac2 --server-only") {
		t.Fatalf("want a stop naming unlink --server-only, got %v", err)
	}
	if !strings.Contains(mac.Read(".ssh/config"), "paseo-srv") || len(w.tunnelLines()) != 2 {
		t.Fatal("remove changed something before it stopped")
	}
	if _, err := w.run(t, true, remove.Options{Clients: []string{"mac2"}, ServerOnly: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := w.run(t, false, remove.Options{}); err != nil {
		t.Fatal(err)
	}
	w.assertClientUnlinked(t, mac)
	w.assertRemoved(t, false)
	if mac2.Read(appFile) != app2 || mac2.Read(".ssh/config") != cfg2 {
		t.Fatal("the unreachable client's files changed")
	}
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

const localToolBlock = `
# BEGIN paseo-host paseo-srv
Host paseo-srv
  HostName srv.tail.test
  User dev
  IdentityFile ~/.ssh/id_ed25519_paseo
  IdentitiesOnly yes
  StrictHostKeyChecking yes
# END paseo-host paseo-srv
`

func TestRemoveLocalToolLink(t *testing.T) {
	w := onboarded(t)
	if err := os.WriteFile(registry.EnvPath(w.cfg.Dir, "srv"), []byte(strings.Replace(localTool, "%s", registry.PasswordPath(w.cfg.Dir, "srv"), 1)), 0o600); err != nil {
		t.Fatal(err)
	}
	mac := w.client(t, "mac", true)
	if _, err := remote.Bash(context.Background(), "mac", `mkdir -p ~/.ssh && ssh-keygen -q -t ed25519 -N "" -C paseo@mac -f ~/.ssh/id_ed25519_paseo`, nil); err != nil {
		t.Fatal(err)
	}
	pub := strings.TrimSpace(mac.Read(".ssh/id_ed25519_paseo.pub"))
	w.srv.Write(".ssh/authorized_keys", ownerLine+"\n"+`restrict,port-forwarding,permitopen="127.0.0.1:6767",command="/bin/false" `+pub+"\n", 0o600)
	mac.Write(".ssh/config", otherSSH+localToolBlock, 0o600)
	if err := w.app.Add(context.Background(), link.Client{Alias: "mac"}, &registry.Entry{Alias: "srv", ListenPort: 6767}, w.pw); err != nil {
		t.Fatal(err)
	}

	refused := func() {
		t.Helper()
		keys, cfg := w.srv.Read(".ssh/authorized_keys"), mac.Read(".ssh/config")
		_, err := w.run(t, false, remove.Options{})
		if report.Code(err) != report.ExitConfig || !strings.Contains(err.Error(), "paseo@mac") {
			t.Fatalf("want exit 3 naming paseo@mac, got %d: %v", report.Code(err), err)
		}
		if w.srv.Read(".ssh/authorized_keys") != keys || mac.Read(".ssh/config") != cfg || !w.serverExists() || !w.registryExists() || !w.app.listsSrv("mac") {
			t.Fatal("a refused remove changed something")
		}
	}
	refused()
	w.client(t, "mac2", true)
	w.link(t, "mac2", false)
	refused()

	if _, err := w.run(t, false, remove.Options{Clients: []string{"mac"}}); err != nil {
		t.Fatal(err)
	}
	w.assertClientUnlinked(t, mac)
	w.assertRemoved(t, false)
}
