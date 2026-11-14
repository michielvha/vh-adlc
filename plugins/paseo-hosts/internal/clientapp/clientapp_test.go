package clientapp_test

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/clientapp"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/config"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/link"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/registry"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/remote"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/runtime"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/testenv"
)

func TestMain(m *testing.M) {
	if clientapp.CommitDelay != 8*time.Second || clientapp.QuitTimeout != 20*time.Second || clientapp.TunnelTimeout != 30*time.Second ||
		clientapp.LaunchTimeout != 60*time.Second || clientapp.QuitFloor != 3*time.Second || clientapp.InstallerTimeout != 120*time.Second ||
		remote.Margin != 30*time.Second {
		panic("clientapp waits differ from the Design")
	}
	clientapp.CommitDelay = 300 * time.Millisecond
	clientapp.QuitTimeout = 500 * time.Millisecond
	clientapp.SettleDelay = 50 * time.Millisecond
	clientapp.TunnelTimeout = 3 * time.Second
	clientapp.LaunchTimeout = time.Second
	clientapp.QuitFloor = quitFloor
	clientapp.InstallerTimeout = 2 * time.Second
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
	testenv.CheckReport(t, w.out.String())
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

// quitFloor is the quit-and-wait floor the tests use in place of the
// Design's 3 seconds.
const quitFloor = 200 * time.Millisecond

// longCommit is a commit delay longer than the CLI waits, so a force-stop
// or an app that exits by itself loses every write since its launch.
const longCommit = time.Minute

// srvHost is the server's entry as an earlier link left it, in the form
// the app keeps.
var srvHost = strings.ReplaceAll(strings.Replace(staleHost, `"host":"old"`, `"host":"paseo-srv"`, 1), "ssh:old::", "ssh:paseo-srv::")

var keptCopyRE = regexp.MustCompile(`app-registry-mac\.\d{8}T\d{6}Z\.backup\.json`)

func (w *world) add() error { return w.ca.Add(context.Background(), w.client(), w.entry, w.pw) }

func (w *world) del() error { return w.ca.Delete(context.Background(), w.client(), "srv", "") }

func rejectSrv(h map[string]any) bool { return h["serverId"] == "srv_srv" }

func mustFail(t *testing.T, err error) {
	t.Helper()
	if err == nil || report.Code(err) == report.ExitOK {
		t.Fatalf("err = %v, want a non-zero exit", err)
	}
}

func mustExit1(t *testing.T, err error) {
	t.Helper()
	if report.Code(err) != report.ExitFailed {
		t.Fatalf("err = %v (code %d), want exit 1", err, report.Code(err))
	}
}

// restoredTo checks the registry the relaunched app keeps.
func (w *world) restoredTo(t *testing.T, want string) {
	t.Helper()
	if got := w.app.stored(); got != want {
		t.Fatalf("registry after the command %s, want %s", got, want)
	}
}

// linked checks the entry in the relaunched app and its tunnel.
func (w *world) linked(t *testing.T) {
	t.Helper()
	if !strings.Contains(w.app.stored(), `"serverId":"srv_srv"`) {
		t.Fatalf("registry %s lacks the entry", w.app.stored())
	}
	if !w.app.hasTunnel("paseo-srv") {
		t.Fatal("the app has no tunnel to paseo-srv")
	}
}

// debugLaunches checks the number of debug launches, at least n, and
// that consecutive ones are at least the quit-and-wait floor apart.
func (w *world) debugLaunches(t *testing.T, n int, exact bool) {
	t.Helper()
	at := w.app.debugLaunches()
	if len(at) < n || exact && len(at) != n {
		t.Fatalf("%d debug launches, want %d; events %q", len(at), n, w.app.kinds())
	}
	for i := 1; i < len(at); i++ {
		if gap := at[i].Sub(at[i-1]); gap < quitFloor {
			t.Fatalf("debug launch %d came %v after the one before, want at least %v", i+1, gap, quitFloor)
		}
	}
}

// keptCopy checks that err names a kept copy holding want, mode 600, and
// returns its path.
func (w *world) keptCopy(t *testing.T, err error, want string) string {
	t.Helper()
	name := keptCopyRE.FindString(err.Error())
	if name == "" {
		t.Fatalf("error %q names no kept copy", err)
	}
	path := filepath.Join(w.cfg.Dir, name)
	if !strings.Contains(err.Error(), path) {
		t.Fatalf("error %q does not name %s", err, path)
	}
	info, serr := os.Stat(path)
	if serr != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("kept copy: %v %v", info, serr)
	}
	if data, _ := os.ReadFile(path); string(data) != want {
		t.Fatalf("kept copy holds %s, want %s", data, want)
	}
	return path
}

func (w *world) noKeptCopy(t *testing.T) {
	t.Helper()
	if m, _ := filepath.Glob(filepath.Join(w.cfg.Dir, "app-registry-mac.*.backup.json")); len(m) > 0 {
		t.Fatalf("kept copies %q", m)
	}
}

// keepsCopyThroughLink runs a following link against a normal app and
// checks that it leaves the kept copy unchanged.
func (w *world) keepsCopyThroughLink(t *testing.T, path string) {
	t.Helper()
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	w.app.calm()
	if err := w.add(); err != nil {
		t.Fatalf("following link: %v\n%s", err, w.out)
	}
	if after, _ := os.ReadFile(path); !bytes.Equal(after, before) {
		t.Fatalf("the following link changed the kept copy to %s", after)
	}
}

func TestRollbackAfterLostWindows(t *testing.T) {
	before := "[" + otherHost + "]"
	for _, tc := range []struct {
		name string
		lose int
	}{{"page stops answering once after a reload", 1}, {"page stops answering after two reloads", 2}} {
		t.Run(tc.name, func(t *testing.T) {
			w := newWorld(t, 6767, before)
			w.app.reject = rejectSrv
			w.app.loseReloads = tc.lose
			mustFail(t, w.add())
			w.restoredTo(t, before)
			w.check(t)
		})
	}
}

func TestRestoreIsReadBack(t *testing.T) {
	before := "[" + otherHost + "]"
	w := newWorld(t, 6767, before)
	w.app.reject = rejectSrv
	deleted := false
	w.app.onReload = func(int) {
		if !deleted && w.app.live[registryKey] == before {
			delete(w.app.live, registryKey)
			deleted = true
		}
	}
	mustFail(t, w.add())
	w.restoredTo(t, before)
	w.check(t)
}

func TestUnlinkRejectedOnceIsCheckedAfterARestart(t *testing.T) {
	before := "[" + otherHost + "," + srvHost + "]"
	w := newWorld(t, 6767, before)
	w.app.onReload = func(n int) {
		if n == 1 {
			w.app.live[registryKey] = before
		}
	}
	mustFail(t, w.del())
	w.restoredTo(t, before)
	w.debugLaunches(t, 2, false)
	w.check(t)
}

func TestRestoreMissingAfterARestartIsRestoredAgain(t *testing.T) {
	before := "[" + otherHost + "]"
	w := newWorld(t, 6767, before)
	w.app.reject = rejectSrv
	deleted := false
	w.app.onQuit = func() {
		if !deleted && w.app.debugPort != "" {
			delete(w.app.live, registryKey)
			deleted = true
		}
	}
	mustFail(t, w.add())
	w.restoredTo(t, before)
	w.debugLaunches(t, 3, false)
	if n := w.app.writesEqual(before); n < 2 {
		t.Fatalf("%d restores, want one in the session and one in the check after the restart", n)
	}
	w.check(t)
}

func TestDebugLaunchAttempts(t *testing.T) {
	t.Run("the first attempt exits early", func(t *testing.T) {
		w := newWorld(t, 6767, "["+otherHost+"]")
		w.app.earlyExits = 1
		if err := w.add(); err != nil {
			t.Fatalf("Add: %v\n%s", err, w.out)
		}
		w.linked(t)
		w.debugLaunches(t, 2, true)
		w.check(t)
	})
	t.Run("all three attempts exit early", func(t *testing.T) {
		before := "[" + otherHost + "]"
		w := newWorld(t, 6767, before)
		w.app.earlyExits = 3
		mustExit1(t, w.add())
		w.restoredTo(t, before)
		w.debugLaunches(t, 3, true)
		w.check(t)
	})
	t.Run("the first page does not answer", func(t *testing.T) {
		w := newWorld(t, 6767, "["+otherHost+"]")
		w.app.deafLaunches = 1
		if err := w.add(); err != nil {
			t.Fatalf("Add: %v\n%s", err, w.out)
		}
		w.linked(t)
		w.debugLaunches(t, 2, true)
		at := w.app.debugLaunches()
		if !w.app.happened("quit", at[0], at[1]) {
			t.Fatalf("no quit after the first attempt: %q", w.app.kinds())
		}
		w.check(t)
	})
}

// The opening comments of the macOS snippets, which a hang marker matches.
const (
	stopSnippet   = "Quits the Paseo app on a Mac"
	launchSnippet = "Starts the Paseo app on a Mac"
)

// shortMargin shortens the deadline margin for one test, so a hung call
// times out quickly while every other test keeps the real margin.
func shortMargin(t *testing.T, d time.Duration) {
	m := remote.Margin
	remote.Margin = d
	t.Cleanup(func() { remote.Margin = m })
}

func TestHungClientCalls(t *testing.T) {
	shortMargin(t, 2*time.Second)
	before := "[" + otherHost + "]"
	timedOut := func(t *testing.T, err error, step string) {
		t.Helper()
		if !regexp.MustCompile(step + `: mac: timed out after \d`).MatchString(err.Error()) {
			t.Fatalf("error %q does not say %s timed out", err, step)
		}
	}
	t.Run("a launch on the first attempt", func(t *testing.T) {
		w := newWorld(t, 6767, before)
		w.mac.HangOn(launchSnippet)
		if err := w.add(); err != nil {
			t.Fatalf("Add: %v\n%s", err, w.out)
		}
		if w.mac.Marked("hang") {
			t.Fatal("no launch call hung")
		}
		w.linked(t)
		// The hung attempt never reached the app.
		w.debugLaunches(t, 1, true)
		w.check(t)
	})
	t.Run("a stop in step 2", func(t *testing.T) {
		w := newWorld(t, 6767, before)
		w.mac.HangOn(stopSnippet)
		err := w.add()
		mustExit1(t, err)
		timedOut(t, err, "quitting the Paseo app")
		w.restoredTo(t, before)
		w.debugLaunches(t, 0, true)
		w.check(t)
	})
	t.Run("a stop during a rollback", func(t *testing.T) {
		w := newWorld(t, 6767, before)
		w.app.reject = rejectSrv
		w.app.onReload = func(n int) {
			if n == 1 {
				w.mac.HangOn(stopSnippet)
			}
		}
		err := w.add()
		mustExit1(t, err)
		if !strings.Contains(err.Error(), "could not confirm that its previous host list is restored") {
			t.Fatalf("error %q is not an unconfirmed rollback", err)
		}
		timedOut(t, err, "quitting the Paseo app")
		w.keptCopy(t, err, before)
		w.check(t)
	})
	t.Run("a stop after a window lost in step 4", func(t *testing.T) {
		w := newWorld(t, 6767, before)
		w.app.loseReloads = 1
		w.app.onReload = func(n int) {
			if n == 1 {
				w.mac.HangOn(stopSnippet)
			}
		}
		err := w.add()
		mustExit1(t, err)
		if !strings.Contains(err.Error(), "could not tell whether the app on mac kept the change") {
			t.Fatalf("error %q is not an unconfirmed outcome", err)
		}
		timedOut(t, err, "quitting the Paseo app")
		w.keptCopy(t, err, before)
		w.check(t)
	})
}

func TestNormalizedRestoreIsConfirmed(t *testing.T) {
	legacy := `{"serverId":"srv_x","label":"x","password":"x-secret","lifecycle":{},` +
		`"connections":[{"id":"legacy-x","type":"remoteSsh","host":"paseo-x","daemonPort":6767}],"preferredConnectionId":"legacy-x",` +
		`"createdAt":"2025-01-01T00:00:00.000Z","updatedAt":"2025-01-01T00:00:00.000Z"}`
	w := newWorld(t, 6767, "["+otherHost+","+legacy+"]")
	w.app.reject = rejectSrv
	err := w.add()
	mustFail(t, err)
	if !strings.Contains(err.Error(), "restored") {
		t.Fatalf("error %q does not say the host list is restored", err)
	}
	w.noKeptCopy(t)
	w.debugLaunches(t, 2, false)
	w.check(t)
}

func TestKeptEntryAfterALostWindow(t *testing.T) {
	t.Run("lost once after the step 4 reload", func(t *testing.T) {
		w := newWorld(t, 6767, "["+otherHost+"]")
		w.app.loseReloads = 1
		if err := w.add(); err != nil {
			t.Fatalf("Add: %v\n%s", err, w.out)
		}
		w.linked(t)
		w.debugLaunches(t, 2, false)
		w.check(t)
	})
	for _, tc := range []struct {
		name   string
		lose   int
		writes int
	}{{"a force-stopped lost window loses the write", 1, 2}, {"two force-stopped lost windows lose the writes", 2, 3}} {
		t.Run(tc.name, func(t *testing.T) {
			w := newWorld(t, 6767, "["+otherHost+"]")
			w.app.commitDelay = longCommit
			w.app.loseReloads = tc.lose
			w.app.stuckHung = true
			if err := w.add(); err != nil {
				t.Fatalf("Add: %v\n%s", err, w.out)
			}
			w.linked(t)
			if n := w.app.writesOf(`"srv_srv"`); n < tc.writes {
				t.Fatalf("%d writes of the change, want %d", n, tc.writes)
			}
			w.check(t)
		})
	}
	t.Run("the app exits by itself after the step 4 reload", func(t *testing.T) {
		w := newWorld(t, 6767, "["+otherHost+"]")
		w.app.commitDelay = longCommit
		w.app.exitReloads = 1
		if err := w.add(); err != nil {
			t.Fatalf("Add: %v\n%s", err, w.out)
		}
		w.linked(t)
		if n := w.app.writesOf(`"srv_srv"`); n < 2 {
			t.Fatalf("%d writes of the change, want 2", n)
		}
		w.check(t)
	})
}

func TestRejectedEntryAfterTheAppExitsByItself(t *testing.T) {
	before := "[" + otherHost + "]"
	w := newWorld(t, 6767, before)
	w.app.commitDelay = longCommit
	w.app.reject = rejectSrv
	w.app.exitReloads = 1
	mustFail(t, w.add())
	if n := w.app.writesOf(`"srv_srv"`); n < 2 {
		t.Fatalf("%d writes of the change, want 2", n)
	}
	w.restoredTo(t, before)
	w.check(t)
}

func TestRollbackWithAForceStop(t *testing.T) {
	w := newWorld(t, 6767, "["+otherHost+"]")
	w.app.commitDelay = longCommit
	w.app.reject = rejectSrv
	w.app.stuck = true
	err := w.add()
	mustExit1(t, err)
	if !strings.Contains(err.Error(), "restored") || !strings.Contains(err.Error(), "force-stopped") {
		t.Fatalf("error %q does not say the host list is restored and the app was force-stopped", err)
	}
	w.debugLaunches(t, 2, false)
	w.noKeptCopy(t)
	w.check(t)
}

func TestStep5ForceStopLosesTheChange(t *testing.T) {
	w := newWorld(t, 6767, "["+otherHost+"]")
	w.app.commitDelay = longCommit
	w.app.stuck = true
	err := w.add()
	mustExit1(t, err)
	if !strings.Contains(err.Error(), "may not have saved") {
		t.Fatalf("error %q does not say the app may not have saved the change", err)
	}
	w.check(t)
}

func TestUnknownOutcomeKeepsACopy(t *testing.T) {
	before := "[" + otherHost + "]"
	t.Run("a third lost window during the rewrites", func(t *testing.T) {
		w := newWorld(t, 6767, before)
		w.app.commitDelay = longCommit
		w.app.loseReloads = 1000
		w.app.stuckHung = true
		err := w.add()
		mustExit1(t, err)
		w.keptCopy(t, err, before)
		w.check(t)
	})
	t.Run("a forward refused after a lost window", func(t *testing.T) {
		w := newWorld(t, 6767, before)
		w.app.loseReloads = 1
		w.app.onReload = func(n int) {
			if n == 1 {
				w.mac.Mark("forward-refused", "")
			}
		}
		err := w.add()
		mustExit1(t, err)
		w.keptCopy(t, err, before)
		w.check(t)
	})
	t.Run("three failed attempts after a lost window", func(t *testing.T) {
		w := newWorld(t, 6767, before)
		w.app.loseReloads = 1
		w.app.onReload = func(n int) {
			if n == 1 {
				w.app.earlyExits = 3
			}
		}
		err := w.add()
		mustExit1(t, err)
		w.keptCopy(t, err, before)
		w.check(t)
	})
}

func TestUnconfirmedRestoreKeepsACopy(t *testing.T) {
	before := "[" + otherHost + "]"
	dropRestored := func(w *world) func(int) {
		return func(int) {
			if w.app.live[registryKey] == before {
				delete(w.app.live, registryKey)
			}
		}
	}
	t.Run("every restore fails", func(t *testing.T) {
		w := newWorld(t, 6767, before)
		w.app.reject = rejectSrv
		w.app.onReload = dropRestored(w)
		err := w.add()
		mustExit1(t, err)
		path := w.keptCopy(t, err, before)
		w.check(t)
		w.keepsCopyThroughLink(t, path)
		w.check(t)
	})
	t.Run("a third reload inside the rollback loses the window", func(t *testing.T) {
		w := newWorld(t, 6767, before)
		w.app.reject = rejectSrv
		w.app.onReload = dropRestored(w)
		w.app.loseReloads = 1000
		err := w.add()
		mustExit1(t, err)
		path := w.keptCopy(t, err, before)
		w.check(t)
		w.keepsCopyThroughLink(t, path)
		w.check(t)
	})
	t.Run("unlink against a page that rejects the change and every restore", func(t *testing.T) {
		withSrv := "[" + otherHost + "," + srvHost + "]"
		w := newWorld(t, 6767, withSrv)
		w.app.onReload = func(int) { w.app.live[registryKey] = "[]" }
		err := w.del()
		mustExit1(t, err)
		path := w.keptCopy(t, err, withSrv)
		w.check(t)
		w.keepsCopyThroughLink(t, path)
		w.check(t)
	})
	t.Run("an app without a host list", func(t *testing.T) {
		w := newWorld(t, 6767, "")
		w.app.reject = rejectSrv
		w.app.onReload = func(int) {
			if _, ok := w.app.live[registryKey]; !ok {
				w.app.live[registryKey] = "[]"
			}
		}
		err := w.add()
		mustFail(t, err)
		if !strings.Contains(err.Error(), "no host list") {
			t.Fatalf("error %q does not say the app had no host list", err)
		}
		if _, serr := os.Stat(filepath.Join(w.cfg.Dir, "app-registry-mac.backup.json")); !os.IsNotExist(serr) {
			t.Fatalf("a backup was written: %v", serr)
		}
		w.noKeptCopy(t)
		w.check(t)
	})
}

const (
	paseoShipIt  = "/Users/me/Library/Caches/sh.paseo.desktop.ShipIt/ShipIt sh.paseo.desktop.ShipIt /Users/me/Library/Caches/sh.paseo.desktop.ShipIt/ShipItState.plist"
	vscodeShipIt = "/Users/me/Library/Caches/com.microsoft.VSCode.ShipIt/ShipIt com.microsoft.VSCode.ShipIt /Users/me/Library/Caches/com.microsoft.VSCode.ShipIt/ShipItState.plist"
	otherShipIt  = "/Users/me/Library/Caches/test.paseo.other.ShipIt/ShipIt test.paseo.other.ShipIt /Users/me/Library/Caches/test.paseo.other.ShipIt/ShipItState.plist"
)

func infoPlist(id string) string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>Paseo</string>
	<key>CFBundleIdentifier</key>
	<string>` + id + `</string>
</dict>
</plist>
`
}

func TestStopWaitsForTheAppsInstaller(t *testing.T) {
	script, err := os.ReadFile("snippets/stop.sh")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, plist, installer, id, source string
	}{
		{"installed identifier", "sh.paseo.desktop", paseoShipIt, "sh.paseo.desktop", "file"},
		{"another identifier", "test.paseo.other", otherShipIt, "test.paseo.other", "file"},
		{"no Info.plist", "", "", "sh.paseo.desktop", "fallback"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := newWorld(t, 6767, "")
			if tc.plist != "" {
				w.mac.Write("Applications/Paseo.app/Contents/Info.plist", infoPlist(tc.plist), 0o644)
			}
			w.app.startInstaller(vscodeShipIt, time.Hour, false)
			if tc.installer != "" {
				w.app.startInstaller(tc.installer, 5*time.Second, false)
			}
			start := time.Now()
			out, err := remote.Bash(context.Background(), "mac", string(script), remote.Vars{
				"app": w.app.appPath, "wait_ms": "500", "fallback": "TERM", "floor_ms": "3000", "limit_ms": "120000",
			})
			took := time.Since(start)
			if err != nil {
				t.Fatalf("stop.sh: %v\n%s", err, out.Text)
			}
			if out.Values["INSTALLER"] != tc.id+".ShipIt" || out.Values["INSTALLER_SOURCE"] != tc.source {
				t.Fatalf("INSTALLER=%q INSTALLER_SOURCE=%q, want %s.ShipIt and %s", out.Values["INSTALLER"], out.Values["INSTALLER_SOURCE"], tc.id, tc.source)
			}
			if out.Values["STOPPED"] != "graceful" || out.Values["INSTALLING"] != "" {
				t.Fatalf("output %q", out.Text)
			}
			least := 3 * time.Second
			if tc.installer != "" {
				least = 5 * time.Second
			}
			if took < least || took > least+3*time.Second {
				t.Fatalf("the quit took %v, want at least %v and no wait for the VS Code installer", took, least)
			}
			quits := w.e.CallsTo("osascript")
			if len(quits) != 1 || !strings.Contains(strings.Join(quits[0].Args, " "), `tell application id "`+tc.id+`" to quit`) {
				t.Fatalf("osascript calls %v", quits)
			}
		})
	}
}

// installerRead is the part of stop.ps1 that reads the installer's name.
func installerRead(t *testing.T) string {
	t.Helper()
	data, err := os.ReadFile("snippets/stop.ps1")
	if err != nil {
		t.Fatal(err)
	}
	_, rest, ok1 := strings.Cut(string(data), "# installer read: begin\n")
	read, _, ok2 := strings.Cut(rest, "# installer read: end\n")
	if !ok1 || !ok2 {
		t.Fatal("stop.ps1 has no installer read section")
	}
	return read
}

func TestStopPS1ReadsTheInstaller(t *testing.T) {
	testenv.RequirePwsh(t)
	for _, tc := range []struct {
		name, yml, installer, source string
	}{
		{"app-update.yml", "provider: generic\nupdaterCacheDirName: 'test-updater'\npublisherName: Paseo\n", "test-updater", "file"},
		{"double quotes", "updaterCacheDirName: \"test-updater\"\r\n", "test-updater", "file"},
		{"no file", "", "@getpaseodesktop-updater", "fallback"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			local := t.TempDir()
			if tc.yml != "" {
				dir := filepath.Join(local, "Programs", "Paseo", "resources")
				if err := os.MkdirAll(dir, 0o700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(dir, "app-update.yml"), []byte(tc.yml), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			cmd := exec.Command("pwsh", "-NoProfile", "-NonInteractive", "-Command", "iex ([Console]::In.ReadToEnd())")
			cmd.Stdin = strings.NewReader("$ErrorActionPreference = 'Stop'\n" + installerRead(t))
			cmd.Env = append(os.Environ(), "LOCALAPPDATA="+local)
			out, err := cmd.CombinedOutput()
			if err != nil {
				t.Fatalf("pwsh: %v\n%s", err, out)
			}
			text := strings.ReplaceAll(string(out), "\r", "")
			if !strings.Contains(text, "INSTALLER="+tc.installer+"\n") || !strings.Contains(text, "INSTALLER_SOURCE="+tc.source+"\n") {
				t.Fatalf("output %q, want INSTALLER=%s and INSTALLER_SOURCE=%s", text, tc.installer, tc.source)
			}
		})
	}
}

// leftStopped checks that the app is stopped and that no launch followed
// its last stop.
func (w *world) leftStopped(t *testing.T) {
	t.Helper()
	kinds := w.app.kinds()
	lastLaunch := slices.Index(kinds, "launch")
	lastStop := -1
	for i, k := range kinds {
		switch k {
		case "launch":
			lastLaunch = i
		case "exit", "killed":
			lastStop = i
		}
	}
	if running, _, _ := w.app.state(); running || lastLaunch > lastStop {
		t.Fatalf("the app was started after it last stopped: %q", kinds)
	}
}

func mustSayRunAgain(t *testing.T, err error) {
	t.Helper()
	mustExit1(t, err)
	if !strings.Contains(err.Error(), "run it again once the update has installed") {
		t.Fatalf("error %q does not say to run it again once the update has installed", err)
	}
}

func TestInstallerOutlivesTheLimit(t *testing.T) {
	before := "[" + otherHost + "," + srvHost + "]"
	t.Run("link", func(t *testing.T) {
		w := newWorld(t, 6767, before)
		w.app.startInstaller(paseoShipIt, time.Hour, false)
		mustSayRunAgain(t, w.add())
		w.leftStopped(t)
		w.restoredTo(t, before)
	})
	t.Run("unlink", func(t *testing.T) {
		w := newWorld(t, 6767, before)
		w.app.startInstaller(paseoShipIt, time.Hour, false)
		mustSayRunAgain(t, w.del())
		w.leftStopped(t)
		w.restoredTo(t, before)
	})
	t.Run("during a rollback", func(t *testing.T) {
		w := newWorld(t, 6767, before)
		w.app.reject = rejectSrv
		w.app.onQuit = func() {
			if w.app.debugPort != "" && len(w.app.installers) == 0 {
				w.app.install(paseoShipIt, forever, false)
			}
		}
		err := w.add()
		mustSayRunAgain(t, err)
		if !strings.Contains(err.Error(), "previous host list") {
			t.Fatalf("error %q is not one of the rollback messages", err)
		}
		w.leftStopped(t)
	})
	t.Run("after a window lost in step 4", func(t *testing.T) {
		w := newWorld(t, 6767, before)
		w.app.loseReloads = 1
		w.app.onReload = func(n int) {
			if n == 1 {
				w.app.install(paseoShipIt, forever, false)
			}
		}
		err := w.add()
		mustSayRunAgain(t, err)
		w.keptCopy(t, err, before)
		w.leftStopped(t)
	})
}

func TestInstallerStartsTheAppAsItEnds(t *testing.T) {
	w := newWorld(t, 6767, "["+otherHost+"]")
	w.app.startInstaller(paseoShipIt, time.Second, true)
	if err := w.add(); err != nil {
		t.Fatalf("Add: %v\n%s", err, w.out)
	}
	w.linked(t)
	kinds := w.app.kinds()
	started := slices.Index(kinds, "installer started the app")
	at := w.app.debugLaunches()
	if started < 0 || len(at) == 0 || !w.app.happened("quit", w.app.eventTime("installer started the app"), at[0]) {
		t.Fatalf("the CLI did not quit the app the installer started before its debug launch: %q", kinds)
	}
	w.check(t)
}

func TestAppExitsAfterItsTunnelAppears(t *testing.T) {
	two := strings.NewReplacer("srv_srv", "srv_two", "paseo-srv", "paseo-two").Replace(srvHost)
	t.Run("link", func(t *testing.T) {
		w := newWorld(t, 6767, "["+otherHost+"]")
		// The tunnel check sees the tunnel; the app exits after it.
		w.app.exitAfterTunnel = 2
		err := w.add()
		mustExit1(t, err)
		if !strings.Contains(err.Error(), "stopped running") {
			t.Fatalf("error %q does not say that the app stopped running", err)
		}
	})
	t.Run("unlink", func(t *testing.T) {
		w := newWorld(t, 6767, "["+otherHost+","+srvHost+","+two+"]")
		w.app.exitAfterTunnel = 1
		err := w.del()
		mustExit1(t, err)
		if !strings.Contains(err.Error(), "stopped running") {
			t.Fatalf("error %q does not say that the app stopped running", err)
		}
	})
}
