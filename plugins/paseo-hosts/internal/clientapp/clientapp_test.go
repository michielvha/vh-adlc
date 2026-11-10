package clientapp_test

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/clientapp"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/config"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/link"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/registry"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/runtime"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/testenv"
)

func TestMain(m *testing.M) {
	if clientapp.CommitDelay != 8*time.Second || clientapp.QuitTimeout != 20*time.Second || clientapp.TunnelTimeout != 30*time.Second {
		panic("clientapp waits differ from the Design")
	}
	clientapp.CommitDelay = 300 * time.Millisecond
	clientapp.QuitTimeout = 500 * time.Millisecond
	clientapp.SettleDelay = 50 * time.Millisecond
	clientapp.TunnelTimeout = 3 * time.Second
	testenv.Main(m)
}

const (
	otherHost = `{"serverId":"srv_other","label":"other","password":"other-secret","appearance":{"color":"teal"},"lifecycle":{},` +
		`"connections":[{"id":"direct:other.example:6767","type":"directTcp","endpoint":"other.example:6767","useTls":false}],` +
		`"preferredConnectionId":"direct:other.example:6767","createdAt":"2025-01-01T00:00:00.000Z","updatedAt":"2025-01-01T00:00:00.000Z"}`
	staleHost = `{"serverId":"srv_srv","label":"old","password":"old","appearance":{"color":"violet","badge":"icon"},"lifecycle":{},` +
		`"connections":[{"id":"ssh:old::","type":"remoteSsh","host":"old"}],"preferredConnectionId":"ssh:old::",` +
		`"createdAt":"2024-05-05T00:00:00.000Z","updatedAt":"2024-05-05T00:00:00.000Z"}`
)

type world struct {
	e     *testenv.Env
	mac   *testenv.Host
	app   *fakeApp
	cfg   config.Config
	entry *registry.Entry
	pw    string
	out   *bytes.Buffer
	ca    *clientapp.App
}

func newWorld(t *testing.T, port int, appRegistry string) *world {
	t.Helper()
	e := testenv.New(t)
	srv := e.Server("srv", testenv.ServerOptions{})
	mac := e.Client("mac", testenv.Darwin)
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
	p := strconv.Itoa(port)
	entry := &registry.Entry{
		Alias: "srv", SSH: "srv", User: "dev", ListenPort: port, ServePort: 8956,
		URL: "ssh://srv?daemonPort=" + p, Version: "0.14.0", PasswordFile: registry.PasswordPath(cfg.Dir, "srv"),
		Unit: "paseo.service", ClientHost: "srv", ClientPort: 22, Clients: []string{"mac"},
	}
	srv.Mark("systemd-active", p)
	srv.Write(".local/share/paseo/state/config.json", `{"daemon":{"auth":{"password":"`+testenv.FakeHash(pw)+`"}}}`, 0o600)
	rt, err := runtime.Ensure(context.Background(), cfg.Cache, cfg.Version)
	if err != nil {
		t.Fatal(err)
	}
	out := &bytes.Buffer{}
	w := &world{e: e, mac: mac, app: newFakeApp(t, mac, appRegistry), cfg: cfg, entry: entry, pw: pw, out: out}
	w.ca = &clientapp.App{
		Dir: cfg.Dir, Paseo: rt.Paseo(),
		Report: report.New(report.Options{Command: "link", Stdout: out, Stderr: out}),
	}
	return w
}

func (w *world) client() link.Client {
	return link.Client{Alias: "mac", Kind: link.Darwin, App: w.app.appPath}
}

func (w *world) check(t *testing.T) {
	t.Helper()
	if strings.Contains(w.out.String(), w.pw) {
		t.Fatal("the output holds the password")
	}
	for _, c := range w.e.Calls() {
		if strings.Contains(strings.Join(c.Args, " "), w.pw) {
			t.Fatalf("the password is in the arguments of %s", c.Name)
		}
	}
	running, port, args := w.app.state()
	if !running || port != "" || len(args) != 0 {
		t.Fatalf("app: running=%v debug port=%q last launch args=%q", running, port, args)
	}
}

func hosts(t *testing.T, raw string) []map[string]any {
	t.Helper()
	var h []map[string]any
	if err := json.Unmarshal([]byte(raw), &h); err != nil {
		t.Fatalf("registry %q: %v", raw, err)
	}
	return h
}

func asJSON(t *testing.T, v any) string {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestAddUpsertsTheNormalizedEntry(t *testing.T) {
	for _, tc := range []struct {
		port int
		conn string
	}{
		{6767, `{"host":"paseo-srv","id":"ssh:paseo-srv::","type":"remoteSsh"}`},
		{6867, `{"daemonPort":6867,"host":"paseo-srv","id":"ssh:paseo-srv::6867","type":"remoteSsh"}`},
	} {
		t.Run(strconv.Itoa(tc.port), func(t *testing.T) {
			// A release build ignores the fault injection switch.
			if !injectionBuilt {
				t.Setenv(rejectSwitch(), "1")
			}
			before := "[" + otherHost + "," + staleHost + "]"
			w := newWorld(t, tc.port, before)
			if err := w.ca.Add(context.Background(), w.client(), w.entry, w.pw); err != nil {
				t.Fatalf("Add: %v\n%s", err, w.out)
			}
			w.check(t)

			got := hosts(t, w.app.stored())
			if len(got) != 2 || asJSON(t, got[0]) != asJSON(t, hosts(t, "["+otherHost+"]")[0]) {
				t.Fatalf("other host changed: %s", w.app.stored())
			}
			h := got[1]
			keys := make([]string, 0, len(h))
			for k := range h {
				keys = append(keys, k)
			}
			slices.Sort(keys)
			want := []string{"appearance", "connections", "createdAt", "label", "lifecycle", "password", "preferredConnectionId", "serverId", "updatedAt"}
			if !slices.Equal(keys, want) {
				t.Fatalf("entry keys %q", keys)
			}
			conn := h["connections"].([]any)
			if h["serverId"] != "srv_srv" || h["label"] != "srv" || h["password"] != w.pw || asJSON(t, h["lifecycle"]) != "{}" ||
				len(conn) != 1 || asJSON(t, conn[0]) != tc.conn || h["preferredConnectionId"] != conn[0].(map[string]any)["id"] ||
				asJSON(t, h["appearance"]) != `{"badge":"icon","color":"violet"}` || h["createdAt"] != "2024-05-05T00:00:00.000Z" ||
				h["updatedAt"] == "2024-05-05T00:00:00.000Z" {
				t.Fatalf("entry: %s", asJSON(t, h))
			}

			backup := filepath.Join(w.cfg.Dir, "app-registry-mac.backup.json")
			info, err := os.Stat(backup)
			if err != nil || info.Mode().Perm() != 0o600 {
				t.Fatalf("backup: %v %v", info, err)
			}
			if data, _ := os.ReadFile(backup); string(data) != before {
				t.Fatalf("backup holds %s", data)
			}

			if gap := w.app.eventTime("quit").Sub(w.app.eventTime("write")); gap < clientapp.CommitDelay {
				t.Fatalf("quit %v after the last registry write, want at least %v", gap, clientapp.CommitDelay)
			}
			if slices.ContainsFunc(w.app.kinds(), func(k string) bool { return strings.HasPrefix(k, "signal") }) {
				t.Fatalf("the app was signalled: %q", w.app.kinds())
			}
		})
	}
}

// rejectSwitch is built at run time so that no binary holds the name
// unless the paseotest code does.
func rejectSwitch() string {
	return strings.Join([]string{"PASEO_HOSTS_TEST", "REJECT", "ENTRY"}, "_")
}

func TestRejectedEntryIsRolledBack(t *testing.T) {
	before := "[" + otherHost + "]"
	w := newWorld(t, 6767, before)
	if injectionBuilt {
		t.Setenv(rejectSwitch(), "1")
	} else {
		w.app.reject = func(h map[string]any) bool { return h["serverId"] == "srv_srv" }
	}
	err := w.ca.Add(context.Background(), w.client(), w.entry, w.pw)
	if err == nil || report.Code(err) == report.ExitOK {
		t.Fatalf("Add = %v, want a failure", err)
	}
	if !strings.Contains(err.Error(), "restored") {
		t.Fatalf("error %q does not say the registry was restored", err)
	}
	if got := w.app.stored(); got != before {
		t.Fatalf("registry %s, want %s", got, before)
	}
	w.check(t)
}

func TestForceStop(t *testing.T) {
	t.Run("link confirms the tunnel", func(t *testing.T) {
		w := newWorld(t, 6767, "["+otherHost+"]")
		w.app.stuck = true
		if err := w.ca.Add(context.Background(), w.client(), w.entry, w.pw); err != nil {
			t.Fatalf("Add: %v\n%s", err, w.out)
		}
		if !slices.Contains(w.app.kinds(), "killed") {
			t.Fatalf("the app was not force-stopped: %q", w.app.kinds())
		}
		if len(hosts(t, w.app.stored())) != 2 {
			t.Fatalf("registry %s", w.app.stored())
		}
		w.check(t)
	})
	t.Run("delete exits 1", func(t *testing.T) {
		w := newWorld(t, 6767, "["+otherHost+","+strings.Replace(staleHost, `"host":"old"`, `"host":"paseo-srv"`, 1)+"]")
		w.app.stuck = true
		err := w.ca.Delete(context.Background(), w.client(), "srv", "")
		if report.Code(err) != report.ExitFailed || !strings.Contains(err.Error(), "may not have saved") {
			t.Fatalf("Delete = %v (code %d)", err, report.Code(err))
		}
		if got := w.app.stored(); got != "["+otherHost+"]" {
			t.Fatalf("registry %s", got)
		}
		w.check(t)
	})
}
