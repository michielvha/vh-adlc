package clientapp_test

import (
	"encoding/json"
	"fmt"
	"maps"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/testenv"
)

const (
	registryKey = "@paseo:daemon-registry"
	clientIDKey = "@paseo:client-id-v1"
)

// fakeApp is the Paseo desktop app on a stand-in Mac. It answers the
// stand-in open, osascript, pgrep and pkill through the client's app.addr
// marker, and serves DevTools while it runs with --remote-debugging-port.
type fakeApp struct {
	appPath string
	client  *testenv.Host

	mu sync.Mutex
	// committed is local storage on disk; live is the running page's copy.
	committed map[string]string
	live      map[string]string
	running   bool
	pid       int
	debugPort string
	devtools  *httptest.Server
	pages     map[*websocket.Conn]bool
	// commitDelay stands in for Chromium's localStorage commit delay: a
	// killed app keeps only writes older than this.
	commitDelay time.Duration
	lastWrite   time.Time
	// stuck makes the app ignore a graceful quit while it is debuggable.
	stuck bool
	// stuckHung makes the app ignore a graceful quit while its window is
	// lost.
	stuckHung bool
	// reject makes the page drop the whole registry on reload when it
	// returns true for an entry, as the app's strict schema does.
	reject func(map[string]any) bool
	// onReload runs after each reload has applied the schema, with the
	// number of the reload counted from 1, and may change live.
	onReload func(n int)
	// onQuit runs when the app quits gracefully, before it flushes.
	onQuit func()
	// loseReloads loses the window after that many next reloads: the page
	// stops answering while the app keeps running.
	loseReloads int
	// exitReloads makes the app exit by itself after that many next
	// reloads, keeping only the writes a kill keeps.
	exitReloads int
	// earlyExits makes that many next debug launches exit before the page
	// answers.
	earlyExits int
	// deafLaunches makes that many next debug launches run with a page
	// that never answers.
	deafLaunches int
	hung, deaf   bool
	reloads      int
	// regWrites holds every value the page wrote to the registry key, with
	// removed for a removeItem.
	regWrites []string
	// exitAfterTunnel, when above 0, is the number of process listings
	// after a launch by the CLI that show the app's tunnels; the app
	// exits by itself before the listing that follows them.
	exitAfterTunnel int
	tunnelListings  int
	// installers are stand-in app update installer processes.
	installers []*installer
	events     []event
	launches   [][]string
	launchAt   []time.Time
}

const removed = "<removed>"

// installer is a stand-in update installer process that runs until a
// time and may start the app as it ends.
type installer struct {
	cmd       string
	until     time.Time
	startsApp bool
}

// forever is an installer end no test reaches.
var forever = time.Now().Add(24 * time.Hour)

// startInstaller starts a stand-in installer that runs for d.
func (a *fakeApp) startInstaller(cmd string, d time.Duration, startsApp bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.install(cmd, time.Now().Add(d), startsApp)
}

// install starts a stand-in installer whose arguments are cmd. Call it
// with mu held.
func (a *fakeApp) install(cmd string, until time.Time, startsApp bool) {
	a.installers = append(a.installers, &installer{cmd: cmd, until: until, startsApp: startsApp})
}

type event struct {
	at   time.Time
	kind string
}

func newFakeApp(t *testing.T, client *testenv.Host, registry string) *fakeApp {
	t.Helper()
	client.Write("Applications/Paseo.app/Contents/MacOS/Paseo", "", 0o755)
	a := &fakeApp{
		appPath:     client.Path("Applications/Paseo.app"),
		client:      client,
		committed:   map[string]string{clientIDKey: "cid_test"},
		commitDelay: 100 * time.Millisecond,
		pid:         4000,
		pages:       map[*websocket.Conn]bool{},
	}
	if registry != "" {
		a.committed[registryKey] = registry
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /launch", a.handleLaunch)
	mux.HandleFunc("POST /quit", func(http.ResponseWriter, *http.Request) {
		a.mu.Lock()
		defer a.mu.Unlock()
		a.event("quit")
		if a.running && !a.ignoresQuit() {
			a.stop(true)
		}
	})
	mux.HandleFunc("GET /ps", a.handlePS)
	mux.HandleFunc("POST /signal", a.handleSignal)
	mux.HandleFunc("GET /devtools", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		defer a.mu.Unlock()
		if !a.running || a.devtools == nil || r.URL.Query().Get("port") != a.debugPort {
			http.Error(w, "connection refused", http.StatusNotFound)
			return
		}
		_, _ = fmt.Fprint(w, strings.TrimPrefix(a.devtools.URL, "http://"))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(func() {
		srv.Close()
		a.mu.Lock()
		defer a.mu.Unlock()
		if a.devtools != nil {
			a.devtools.Close()
		}
	})
	client.Mark("app.addr", strings.TrimPrefix(srv.URL, "http://"))
	a.launch(nil)
	return a
}

func (a *fakeApp) event(kind string) {
	a.events = append(a.events, event{time.Now(), kind})
}

// eventTime returns the time of the last event of kind.
func (a *fakeApp) eventTime(kind string) time.Time {
	a.mu.Lock()
	defer a.mu.Unlock()
	for i := len(a.events) - 1; i >= 0; i-- {
		if a.events[i].kind == kind {
			return a.events[i].at
		}
	}
	return time.Time{}
}

func (a *fakeApp) kinds() []string {
	a.mu.Lock()
	defer a.mu.Unlock()
	var k []string
	for _, e := range a.events {
		k = append(k, e.kind)
	}
	return k
}

func (a *fakeApp) handleLaunch(w http.ResponseWriter, r *http.Request) {
	var args []string
	if err := json.NewDecoder(r.Body).Decode(&args); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if !a.running {
		a.launch(args)
	}
}

func (a *fakeApp) launch(args []string) {
	a.running = true
	a.pid++
	a.live = maps.Clone(a.committed)
	a.launches = append(a.launches, args)
	a.launchAt = append(a.launchAt, time.Now())
	a.hung, a.deaf = false, false
	a.event("launch")
	for _, arg := range args {
		if p, ok := strings.CutPrefix(arg, "--remote-debugging-port="); ok {
			if a.earlyExits > 0 {
				a.earlyExits--
				a.running = false
				a.event("early exit")
				return
			}
			if a.deafLaunches > 0 {
				a.deafLaunches--
				a.deaf = true
			}
			a.debugPort = p
			a.devtools = a.serveDevTools(p)
		}
	}
}

// ignoresQuit reports whether the app ignores a graceful quit now.
func (a *fakeApp) ignoresQuit() bool {
	return a.debugPort != "" && (a.stuck || a.stuckHung && a.hung)
}

// stop ends the app. A graceful stop flushes every write; a kill keeps
// only writes older than the commit delay.
func (a *fakeApp) stop(graceful bool) {
	if graceful && a.onQuit != nil {
		a.onQuit()
	}
	if graceful || time.Since(a.lastWrite) >= a.commitDelay {
		a.committed = maps.Clone(a.live)
	}
	a.running = false
	a.debugPort = ""
	for c := range a.pages {
		_ = c.CloseNow()
	}
	clear(a.pages)
	if a.devtools != nil {
		go a.devtools.Close()
		a.devtools = nil
	}
	if graceful {
		a.event("exit")
	} else {
		a.event("killed")
	}
}

func (a *fakeApp) handlePS(w http.ResponseWriter, _ *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	procs := []testenv.Proc{}
	a.installers = slices.DeleteFunc(a.installers, func(i *installer) bool {
		if time.Now().Before(i.until) {
			return false
		}
		if i.startsApp && !a.running {
			a.launch(nil)
			a.event("installer started the app")
		}
		return true
	})
	for n, i := range a.installers {
		procs = append(procs, testenv.Proc{PID: 7000 + n, Cmd: i.cmd})
	}
	if a.exitAfterTunnel > 0 && a.running && a.debugPort == "" && len(a.launches) > 1 && len(a.tunnels()) > 0 {
		if a.tunnelListings == a.exitAfterTunnel {
			a.exitAfterTunnel = 0
			a.event("exits by itself")
			a.stop(false)
		} else {
			a.tunnelListings++
		}
	}
	if a.running {
		cmd := a.appPath + "/Contents/MacOS/Paseo"
		if a.debugPort != "" {
			cmd += " --remote-debugging-port=" + a.debugPort
		}
		procs = append(procs, testenv.Proc{PID: a.pid, Cmd: cmd})
		if a.debugPort == "" {
			for i, target := range a.tunnels() {
				procs = append(procs, testenv.Proc{PID: 9000 + i, Cmd: "/usr/bin/ssh -T -o BatchMode=yes -o ConnectTimeout=10 -o ClearAllForwardings=yes -o ExitOnForwardFailure=yes -W " + target})
			}
		}
	}
	_ = json.NewEncoder(w).Encode(procs)
}

// tunnels lists the -W targets of the app's Remote SSH connections.
func (a *fakeApp) tunnels() []string {
	var out []string
	for _, h := range parseRegistry(a.live[registryKey]) {
		conns, _ := h["connections"].([]any)
		for _, c := range conns {
			m, _ := c.(map[string]any)
			if m["type"] != "remoteSsh" {
				continue
			}
			port := "6767"
			if p, ok := m["daemonPort"].(float64); ok {
				port = strconv.Itoa(int(p))
			}
			out = append(out, fmt.Sprintf("127.0.0.1:%s %v", port, m["host"]))
		}
	}
	return out
}

func (a *fakeApp) handleSignal(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PID    int    `json:"pid"`
		Signal string `json:"signal"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.event("signal " + req.Signal)
	if !a.running || req.PID != a.pid {
		return
	}
	switch req.Signal {
	case "KILL", "9":
		a.stop(false)
	case "TERM", "15":
		if !a.ignoresQuit() {
			a.stop(true)
		}
	}
}

func (a *fakeApp) serveDevTools(port string) *httptest.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /json/version", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprint(w, `{"Browser":"Paseo/0.15.3"}`)
	})
	mux.HandleFunc("GET /json/list", func(w http.ResponseWriter, _ *http.Request) {
		a.mu.Lock()
		lost := a.hung || a.deaf
		a.mu.Unlock()
		if lost {
			_, _ = fmt.Fprint(w, "[]")
			return
		}
		_, _ = fmt.Fprintf(w, `[{"id":"2","type":"page","url":"about:blank","webSocketDebuggerUrl":"ws://127.0.0.1:%[1]s/devtools/page/2"},`+
			`{"id":"1","type":"page","url":"app://paseo/","webSocketDebuggerUrl":"ws://127.0.0.1:%[1]s/devtools/page/1"}]`, port)
	})
	mux.HandleFunc("/devtools/page/{id}", a.handlePage)
	return httptest.NewServer(mux)
}

var lsCall = regexp.MustCompile(`^localStorage\.(getItem|setItem|removeItem)\((.*)\)$`)

func (a *fakeApp) handlePage(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer func() { _ = c.CloseNow() }()
	c.SetReadLimit(16 << 20)
	a.mu.Lock()
	a.pages[c] = true
	a.mu.Unlock()
	appPage := r.PathValue("id") == "1"
	ctx := r.Context()
	for {
		_, data, err := c.Read(ctx)
		if err != nil {
			return
		}
		var req struct {
			ID     int    `json:"id"`
			Method string `json:"method"`
			Params struct {
				Expression string `json:"expression"`
			} `json:"params"`
		}
		if err := json.Unmarshal(data, &req); err != nil {
			return
		}
		result := a.dispatch(appPage, req.Method, req.Params.Expression)
		resp, _ := json.Marshal(map[string]any{"id": req.ID, "result": result})
		if err := c.Write(ctx, websocket.MessageText, resp); err != nil {
			return
		}
	}
}

func (a *fakeApp) dispatch(appPage bool, method, expr string) any {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.hung || a.deaf {
		return map[string]any{"result": map[string]any{"type": "undefined"}, "exceptionDetails": map[string]any{"text": "the page does not answer"}}
	}
	switch method {
	case "Page.reload":
		if appPage {
			a.reload()
		}
		return map[string]any{}
	case "Runtime.evaluate":
	default:
		return map[string]any{}
	}
	if expr == "window.close()" {
		a.event("window.close")
		if !a.ignoresQuit() {
			go func() {
				a.mu.Lock()
				defer a.mu.Unlock()
				if a.running {
					a.stop(true)
				}
			}()
		}
		return value(nil)
	}
	m := lsCall.FindStringSubmatch(expr)
	var args []string
	if m == nil || json.Unmarshal([]byte("["+m[2]+"]"), &args) != nil {
		return map[string]any{"result": map[string]any{"type": "undefined"}, "exceptionDetails": map[string]any{"text": "unsupported expression: " + expr}}
	}
	store := a.live
	if !appPage {
		store = map[string]string{}
	}
	switch {
	case m[1] == "getItem" && len(args) == 1:
		if v, ok := store[args[0]]; ok {
			return value(v)
		}
		return value(nil)
	case m[1] == "setItem" && len(args) == 2 && appPage:
		store[args[0]] = args[1]
		if args[0] == registryKey {
			a.regWrites = append(a.regWrites, args[1])
		}
	case m[1] == "removeItem" && len(args) == 1 && appPage:
		delete(store, args[0])
		if args[0] == registryKey {
			a.regWrites = append(a.regWrites, removed)
		}
	default:
		return map[string]any{"result": map[string]any{"type": "undefined"}, "exceptionDetails": map[string]any{"text": "bad call: " + expr}}
	}
	a.lastWrite = time.Now()
	a.event("write")
	return value(nil)
}

func value(v any) map[string]any {
	if v == nil {
		return map[string]any{"result": map[string]any{"type": "object", "subtype": "null", "value": nil}}
	}
	return map[string]any{"result": map[string]any{"type": "string", "value": v}}
}

var (
	hostKeys = []string{"serverId", "label", "password", "appearance", "lifecycle", "connections", "preferredConnectionId", "createdAt", "updatedAt"}
	connKeys = []string{"id", "type", "host", "sshPort", "daemonPort", "endpoint", "useTls"}
)

// reload applies the app's strict schema, runs onReload, and then loses
// the window or exits as loseReloads and exitReloads ask.
func (a *fakeApp) reload() {
	a.reloads++
	a.event("reload")
	a.applySchema()
	if a.onReload != nil {
		before, had := a.live[registryKey]
		a.onReload(a.reloads)
		if after, has := a.live[registryKey]; has != had || after != before {
			a.lastWrite = time.Now()
		}
	}
	if a.loseReloads > 0 {
		a.loseReloads--
		a.hung = true
		a.event("window lost")
	}
	if a.exitReloads > 0 {
		a.exitReloads--
		a.event("exits by itself")
		a.stop(false)
	}
}

// applySchema applies the app's strict schema: one invalid entry drops the
// whole registry. Remote SSH connections are rewritten in the app's
// normalized form, and a preferred connection id follows its connection.
func (a *fakeApp) applySchema() {
	raw, ok := a.live[registryKey]
	if !ok {
		return
	}
	hosts := parseRegistry(raw)
	valid, changed := hosts != nil, false
	for _, h := range hosts {
		for k := range h {
			valid = valid && slices.Contains(hostKeys, k)
		}
		if a.reject != nil && a.reject(h) {
			valid = false
		}
		conns, _ := h["connections"].([]any)
		for _, c := range conns {
			m, _ := c.(map[string]any)
			for k := range m {
				valid = valid && slices.Contains(connKeys, k)
			}
			old := m["id"]
			if m["type"] == "remoteSsh" && normalize(m) {
				changed = true
				if h["preferredConnectionId"] == old {
					h["preferredConnectionId"] = m["id"]
				}
			}
		}
	}
	switch {
	case !valid:
		a.live[registryKey] = "[]"
	case changed:
		data, _ := json.Marshal(hosts)
		a.live[registryKey] = string(data)
	default:
		return
	}
	a.lastWrite = time.Now()
}

// normalize rewrites a Remote SSH connection the way the app does and
// reports whether it changed.
func normalize(c map[string]any) bool {
	before := fmt.Sprint(c)
	port := ""
	if p, ok := c["daemonPort"].(float64); ok && p != 6767 {
		port = strconv.Itoa(int(p))
	} else {
		delete(c, "daemonPort")
	}
	ssh := ""
	if p, ok := c["sshPort"].(float64); ok {
		ssh = strconv.Itoa(int(p))
	}
	c["id"] = "ssh:" + url.QueryEscape(fmt.Sprint(c["host"])) + ":" + ssh + ":" + port
	return fmt.Sprint(c) != before
}

func parseRegistry(raw string) []map[string]any {
	if raw == "" {
		return []map[string]any{}
	}
	var hosts []map[string]any
	if json.Unmarshal([]byte(raw), &hosts) != nil {
		return nil
	}
	return hosts
}

// stored returns the registry on disk.
func (a *fakeApp) stored() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.committed[registryKey]
}

// state reports whether the app runs, its debugging port and its last
// launch arguments.
func (a *fakeApp) state() (bool, string, []string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.running, a.debugPort, a.launches[len(a.launches)-1]
}

// debugLaunches returns the times of the launches with a debugging port.
func (a *fakeApp) debugLaunches() []time.Time {
	a.mu.Lock()
	defer a.mu.Unlock()
	var at []time.Time
	for i, args := range a.launches {
		if slices.ContainsFunc(args, func(s string) bool { return strings.HasPrefix(s, "--remote-debugging-port=") }) {
			at = append(at, a.launchAt[i])
		}
	}
	return at
}

// writesOf counts the registry writes whose value contains s.
func (a *fakeApp) writesOf(s string) int {
	a.mu.Lock()
	defer a.mu.Unlock()
	n := 0
	for _, v := range a.regWrites {
		if strings.Contains(v, s) {
			n++
		}
	}
	return n
}

// writesEqual counts the registry writes of exactly v.
func (a *fakeApp) writesEqual(v string) int {
	a.mu.Lock()
	defer a.mu.Unlock()
	n := 0
	for _, w := range a.regWrites {
		if w == v {
			n++
		}
	}
	return n
}

// happened reports whether an event of kind came between from and to.
func (a *fakeApp) happened(kind string, from, to time.Time) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return slices.ContainsFunc(a.events, func(e event) bool { return e.kind == kind && e.at.After(from) && e.at.Before(to) })
}

// hasTunnel reports whether the running app has a tunnel to host.
func (a *fakeApp) hasTunnel(host string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.running && a.debugPort == "" && slices.ContainsFunc(a.tunnels(), func(s string) bool { return strings.HasSuffix(s, " "+host) })
}

// calm ends every fault, so a following command runs against a normal app.
func (a *fakeApp) calm() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.stuck, a.stuckHung, a.reject, a.onReload, a.onQuit = false, false, nil, nil, nil
	a.loseReloads, a.exitReloads, a.earlyExits, a.deafLaunches = 0, 0, 0, 0
	a.installers = nil
}
