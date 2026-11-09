package clean

import (
	"net"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/internal/report"
)

func TestResolveSocket(t *testing.T) {
	cases := []struct {
		host   string
		socket string
		ok     bool
	}{
		{"", DefaultDockerSocket, true},
		{"unix:///run/user/1000/docker.sock", "/run/user/1000/docker.sock", true},
		{"tcp://127.0.0.1:2375", "", false},
		{"ssh://host", "", false},
	}
	for _, c := range cases {
		socket, ok := ResolveSocket(c.host)
		if socket != c.socket || ok != c.ok {
			t.Errorf("%q: %q, %v", c.host, socket, ok)
		}
	}
}

func TestListEngine(t *testing.T) {
	f := newFakeEngine(t)
	f.containers = []container{{ID: "c1", Mounts: []mount{{Type: "bind", Source: "/tmp/example-run-x/data"}, {Type: "volume", Source: "/var/lib/docker/volumes/v"}}}}
	state, err := listEngine(t.Context(), f.engine())
	if err != nil || state.Absent || len(state.Containers) != 1 {
		t.Fatalf("listing: %+v, %v", state, err)
	}
	if got := state.binds(); !slices.Equal(got, []string{"/tmp/example-run-x/data"}) {
		t.Fatalf("binds %q", got)
	}
	if got := f.changes(); len(got) != 0 {
		t.Fatalf("a listing changed the engine: %q", got)
	}
}

func TestEngineAbsentOrUnreachable(t *testing.T) {
	dir := t.TempDir()
	refused := filepath.Join(dir, "refused.sock")
	l, err := net.Listen("unix", refused)
	if err != nil {
		t.Fatal(err)
	}
	l.(*net.UnixListener).SetUnlinkOnClose(false)
	_ = l.Close()

	denied := newFakeEngine(t)
	if err := os.Chmod(denied.socket, 0); err != nil {
		t.Fatal(err)
	}
	failing := newFakeEngine(t)
	failing.status["GET /containers/json"] = 500

	for name, e := range map[string]*Engine{
		"no engine configured": nil,
		"absent socket":        NewEngine(filepath.Join(dir, "absent.sock")),
		"refused socket":       NewEngine(refused),
	} {
		state, err := listEngine(t.Context(), e)
		if err != nil || !state.Absent {
			t.Errorf("%s: %+v, %v; want an absent engine", name, state, err)
		}
	}
	for name, e := range map[string]*Engine{"denied socket": denied.engine(), "failed listing": failing.engine()} {
		_, err := listEngine(t.Context(), e)
		if codeOf(err) != report.CodeEngineUnreachable {
			t.Errorf("%s: %v; want %s", name, err, report.CodeEngineUnreachable)
		}
	}
}

// TestBindMountKeepsEntry feeds the engine's bind sources to the file plan.
func TestBindMountKeepsEntry(t *testing.T) {
	h := newFakeHost(t)
	bound := h.entry("example-run-bound", 30*time.Hour)
	h.entry("example-run-free", 30*time.Hour)
	f := newFakeEngine(t)
	f.containers = []container{{ID: "c1", Mounts: []mount{{Type: "bind", Source: bound}}}}
	state, err := listEngine(t.Context(), f.engine())
	if err != nil {
		t.Fatal(err)
	}
	plan, err := planFiles(h.files(), fileInputs{Rules: exampleRules(), TempBase: h.base, Binds: state.binds()})
	if err != nil {
		t.Fatal(err)
	}
	if got := itemNames(plan.Remove); !slices.Equal(got, []string{"example-run-free:abandoned"}) {
		t.Errorf("remove %q", got)
	}
	if got := itemNames(plan.Keep); !slices.Equal(got, []string{"example-run-bound:in-use"}) {
		t.Errorf("keep %q", got)
	}
}
