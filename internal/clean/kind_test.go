package clean

import (
	"context"
	"errors"
	"os/exec"
	"slices"
	"syscall"
	"testing"

	"github.com/michielvha/vh-adlc/internal/report"
)

const kindLabel = "io.x-k8s.kind.cluster"

// kindFake is a fake kind on PATH and a fake process table: pids in live
// answer kill(pid, 0), every other pid is gone.
type kindFake struct {
	live    map[int]bool
	deleted []string
	missing bool
	fail    bool
}

func (k *kindFake) host() kindHost {
	return kindHost{
		Hostname: "this-host",
		Kill: func(pid int) error {
			if k.live[pid] {
				return nil
			}
			return syscall.ESRCH
		},
		LookPath: func(string) (string, error) {
			if k.missing {
				return "", exec.ErrNotFound
			}
			return "/fake/kind", nil
		},
		Run: func(_ context.Context, name string, args ...string) error {
			if name != "/fake/kind" || len(args) != 4 || args[0] != "delete" || args[1] != "cluster" || args[2] != "--name" {
				return errors.New("unexpected kind call")
			}
			if k.fail {
				return errors.New("kind failed")
			}
			k.deleted = append(k.deleted, args[3])
			return nil
		},
	}
}

func node(id, cluster, state string) container {
	return container{ID: id, State: state, Labels: map[string]string{kindLabel: cluster}}
}

func mark(name, cluster, value string) volume {
	return volume{Name: name, Labels: map[string]string{kindLabel: cluster, "example.kind-run": value}}
}

var kindRules = []KindRule{{Cluster: "example-*", Liveness: Liveness{Kind: LivenessPID, Label: "example.kind-run"}}}

func runKind(t *testing.T, f *fakeEngine, k *kindFake, flag, dry bool) engineResult {
	t.Helper()
	state, err := listEngine(t.Context(), f.engine())
	if err != nil {
		t.Fatal(err)
	}
	return doKind(t.Context(), f.engine(), state, kindRules, k.host(), flag, dry)
}

// kindEngine holds clusters in each state AC-08 names.
func kindEngine(t *testing.T) *fakeEngine {
	t.Helper()
	f := newFakeEngine(t)
	f.containers = []container{
		node("e1", "example-ended", "running"), node("e2", "example-ended", "exited"),
		node("n1", "example-nomark", "running"),
		node("l1", "example-live", "running"),
		node("r1", "example-reused", "running"),
		node("h1", "example-otherhost", "running"),
		node("x1", "unrelated-cluster", "running"),
	}
	f.volumes = []volume{
		mark("m-ended-1", "example-ended", "this-host/1001"),
		mark("m-ended-2", "example-ended", "this-host/1002"),
		mark("m-live", "example-live", "this-host/2001"),
		// A killed run's mark beside the live mark of a run that reused the
		// cluster and keeps it.
		mark("m-reused-old", "example-reused", "this-host/1003"),
		mark("m-reused-new", "example-reused", "this-host/2002"),
		mark("m-otherhost", "example-otherhost", "other-host/1004"),
		mark("m-gone", "example-gone", "this-host/1005"),
		mark("m-bad", "example-live", "not-a-mark"),
	}
	return f
}

func liveFake() *kindFake {
	return &kindFake{live: map[int]bool{2001: true, 2002: true}}
}

func TestKindNeedsItsFlag(t *testing.T) {
	f := kindEngine(t)
	k := liveFake()
	res := runKind(t, f, k, false, false)
	if got := f.changes(); len(got) != 0 || len(k.deleted) != 0 {
		t.Fatalf("changed without --kind: %q, deleted %q", got, k.deleted)
	}
	if got := kindsAndNames(res.NeedsFlag); !slices.Equal(got, []string{"kind_cluster example-ended:needs --kind"}) {
		t.Fatalf("needs flag %q", got)
	}
}

func TestKindDryRun(t *testing.T) {
	f := kindEngine(t)
	k := liveFake()
	res := runKind(t, f, k, true, true)
	if got := f.changes(); len(got) != 0 || len(k.deleted) != 0 {
		t.Fatalf("a dry run changed: %q, deleted %q", got, k.deleted)
	}
	want := []string{"kind_cluster example-ended:abandoned", "kind_mark m-ended-1:abandoned", "kind_mark m-ended-2:abandoned"}
	if got := kindsAndNames(res.Removed); !slices.Equal(got, want) {
		t.Fatalf("planned %q, want %q", got, want)
	}
}

func TestKindDeletesOnlyAnEndedCluster(t *testing.T) {
	f := kindEngine(t)
	k := liveFake()
	res := runKind(t, f, k, true, false)
	if len(res.Failures) != 0 {
		t.Fatalf("failures %v", res.Failures)
	}
	if !slices.Equal(k.deleted, []string{"example-ended"}) {
		t.Fatalf("kind deleted %q", k.deleted)
	}
	wantCalls := []string{"POST /containers/e1/stop", "DELETE /volumes/m-ended-1", "DELETE /volumes/m-ended-2"}
	if got := f.changes(); !slices.Equal(got, wantCalls) {
		t.Fatalf("calls %q, want %q", got, wantCalls)
	}
	wantKept := []string{
		"kind_cluster example-live:live", "kind_cluster example-nomark:unmarked",
		"kind_cluster example-otherhost:live", "kind_cluster example-reused:live",
	}
	if got := kindsAndNames(res.Kept); !slices.Equal(got, wantKept) {
		t.Fatalf("kept %q, want %q", got, wantKept)
	}
}

func TestKindUnavailable(t *testing.T) {
	f := kindEngine(t)
	k := liveFake()
	k.missing = true
	res := runKind(t, f, k, true, false)
	if got := f.changes(); len(got) != 0 {
		t.Fatalf("changed the engine with no kind: %q", got)
	}
	if len(res.Failures) != 1 || res.Failures[0].Code != report.CodeKindUnavailable {
		t.Fatalf("failures %v", res.Failures)
	}
	if got := kindsAndNames(res.Kept); !slices.Contains(got, "kind_cluster example-ended:kind-unavailable") {
		t.Fatalf("kept %q", got)
	}
}

func TestKindDeleteFails(t *testing.T) {
	f := kindEngine(t)
	k := liveFake()
	k.fail = true
	res := runKind(t, f, k, true, false)
	if len(res.Failures) != 1 || res.Failures[0].Code != report.CodeRemovalFailed {
		t.Fatalf("failures %v", res.Failures)
	}
	for _, c := range f.changes() {
		if c == "DELETE /volumes/m-ended-1" {
			t.Fatal("removed a mark of a cluster kind did not delete")
		}
	}
}

func TestMarkEnded(t *testing.T) {
	k := liveFake()
	h := k.host()
	cases := map[string]bool{
		"this-host/1001":  true,
		"this-host/2001":  false,
		"other-host/1001": false,
		"this-host/":      false,
		"this-host/x":     false,
		"no-slash":        false,
		"this-host/-1":    false,
		"this-host/0":     false,
	}
	for value, want := range cases {
		if got := markEnded(Liveness{Kind: LivenessPID, Label: "l"}, value, h); got != want {
			t.Errorf("%q: %v, want %v", value, got, want)
		}
	}
	dir := t.TempDir()
	if markEnded(Liveness{Kind: LivenessPath, Label: "l"}, dir, h) {
		t.Error("a present path read as ended")
	}
	if !markEnded(Liveness{Kind: LivenessPath, Label: "l"}, dir+"/gone", h) {
		t.Error("a gone path read as live")
	}
	if markEnded(Liveness{Kind: LivenessPath, Label: "l"}, "relative/gone", h) {
		t.Error("a relative path read as ended")
	}
}
