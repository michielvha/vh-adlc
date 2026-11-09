package clean

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// fakeEngine is a Docker Engine API stand-in on a Unix socket. It records
// every call and fails the test on any force parameter.
type fakeEngine struct {
	t          *testing.T
	socket     string
	mu         sync.Mutex
	calls      []string
	containers []container
	networks   []network
	volumes    []volume
	status     map[string]int // "METHOD /path" -> status to answer
}

func newFakeEngine(t *testing.T) *fakeEngine {
	t.Helper()
	f := &fakeEngine{t: t, socket: filepath.Join(t.TempDir(), "d.sock"), status: map[string]int{}}
	l, err := net.Listen("unix", f.socket)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewUnstartedServer(http.HandlerFunc(f.serve))
	srv.Listener = l
	srv.Start()
	t.Cleanup(srv.Close)
	return f
}

func (f *fakeEngine) engine() *Engine { return NewEngine(f.socket) }

func (f *fakeEngine) recorded() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.calls...)
}

// changes are the recorded calls that are not listings.
func (f *fakeEngine) changes() []string {
	var out []string
	for _, c := range f.recorded() {
		if !strings.HasPrefix(c, "GET ") {
			out = append(out, c)
		}
	}
	return out
}

func matchesLabel(labels map[string]string, filter string) bool {
	var q struct {
		Label []string `json:"label"`
	}
	if filter == "" {
		return true
	}
	if err := json.Unmarshal([]byte(filter), &q); err != nil {
		return false
	}
	for _, l := range q.Label {
		k, v, hasValue := strings.Cut(l, "=")
		got, ok := labels[k]
		if !ok || (hasValue && got != v) {
			return false
		}
	}
	return true
}

func (f *fakeEngine) serve(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	call := r.Method + " " + r.URL.Path
	f.calls = append(f.calls, call)
	if r.URL.Query().Has("force") {
		f.t.Errorf("%s sent force=%s", call, r.URL.Query().Get("force"))
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if s, ok := f.status[call]; ok {
		w.WriteHeader(s)
		return
	}
	enc := json.NewEncoder(w)
	filter := r.URL.Query().Get("filters")
	switch {
	case call == "GET /containers/json":
		_ = enc.Encode(f.containers)
	case call == "GET /networks":
		var out []network
		for _, n := range f.networks {
			if matchesLabel(n.Labels, filter) {
				out = append(out, n)
			}
		}
		_ = enc.Encode(out)
	case call == "GET /volumes":
		var out []volume
		for _, v := range f.volumes {
			if matchesLabel(v.Labels, filter) {
				out = append(out, v)
			}
		}
		_ = enc.Encode(map[string]any{"Volumes": out})
	case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/stop"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/containers/"), "/stop")
		for i := range f.containers {
			if f.containers[i].ID == id {
				f.containers[i].State = "exited"
			}
		}
		w.WriteHeader(http.StatusNoContent)
	case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/containers/"):
		id := strings.TrimPrefix(r.URL.Path, "/containers/")
		f.containers = removeWhere(f.containers, func(c container) bool { return c.ID == id })
		w.WriteHeader(http.StatusNoContent)
	case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/networks/"):
		id := strings.TrimPrefix(r.URL.Path, "/networks/")
		f.networks = removeWhere(f.networks, func(n network) bool { return n.ID == id })
		w.WriteHeader(http.StatusNoContent)
	case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/volumes/"):
		name := strings.TrimPrefix(r.URL.Path, "/volumes/")
		f.volumes = removeWhere(f.volumes, func(v volume) bool { return v.Name == name })
		w.WriteHeader(http.StatusNoContent)
	default:
		f.t.Errorf("unexpected call %s", call)
		w.WriteHeader(http.StatusNotFound)
	}
}

func removeWhere[T any](s []T, drop func(T) bool) []T {
	var out []T
	for _, v := range s {
		if !drop(v) {
			out = append(out, v)
		}
	}
	return out
}
