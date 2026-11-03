package clean

import (
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/michielvha/vh-adlc/internal/report"
)

const (
	labelProject = "com.docker.compose.project"
	labelWorkDir = "com.docker.compose.project.working_dir"
)

func composeContainer(id, project, workdir, state string) container {
	labels := map[string]string{labelProject: project}
	if workdir != "" {
		labels[labelWorkDir] = workdir
	}
	return container{ID: id, State: state, Labels: labels}
}

func kindsAndNames(items []Item) []string {
	var out []string
	for _, it := range items {
		out = append(out, it.Kind+" "+it.Name+":"+it.Reason)
	}
	slices.Sort(out)
	return out
}

// composeEngine holds one abandoned project, one live, one mixed after an
// upgrade from another checkout, one with a container that has no working
// directory label, and an unmatched one.
func composeEngine(t *testing.T) (*fakeEngine, string) {
	t.Helper()
	dir := t.TempDir()
	present := filepath.Join(dir, "present")
	if err := os.Mkdir(present, 0o755); err != nil {
		t.Fatal(err)
	}
	gone := filepath.Join(dir, "gone")
	f := newFakeEngine(t)
	f.containers = []container{
		composeContainer("a1", "example-1", gone, "running"),
		composeContainer("a2", "example-1", gone, "exited"),
		composeContainer("l1", "example-2", present, "running"),
		composeContainer("m1", "example-3", gone, "running"),
		composeContainer("m2", "example-3", present, "running"),
		composeContainer("n1", "example-4", "", "running"),
		composeContainer("d1", "deploy", gone, "running"),
	}
	f.networks = []network{
		{ID: "net1", Name: "example-1_default", Labels: map[string]string{labelProject: "example-1"}},
		{ID: "net2", Name: "example-2_default", Labels: map[string]string{labelProject: "example-2"}},
	}
	f.volumes = []volume{
		{Name: "example-1_data", Labels: map[string]string{labelProject: "example-1"}},
		{Name: "example-2_data", Labels: map[string]string{labelProject: "example-2"}},
		{Name: "deploy_data", Labels: map[string]string{labelProject: "deploy"}},
	}
	return f, gone
}

var composeRules = []ComposeRule{{Project: "example-*", Volumes: true}}

func runCompose(t *testing.T, f *fakeEngine, rules []ComposeRule, flag, dry bool) engineResult {
	t.Helper()
	state, err := listEngine(t.Context(), f.engine())
	if err != nil {
		t.Fatal(err)
	}
	return doCompose(t.Context(), f.engine(), state, rules, flag, dry)
}

func TestComposeNeedsItsFlag(t *testing.T) {
	f, _ := composeEngine(t)
	res := runCompose(t, f, composeRules, false, false)
	if got := f.changes(); len(got) != 0 {
		t.Fatalf("changed the engine without --compose: %q", got)
	}
	want := []string{"compose_project example-1:needs --compose"}
	if got := kindsAndNames(res.NeedsFlag); !slices.Equal(got, want) {
		t.Fatalf("needs flag %q, want %q", got, want)
	}
	if len(res.Removed) != 0 {
		t.Fatalf("removed %v", res.Removed)
	}
}

func TestComposeDryRun(t *testing.T) {
	f, _ := composeEngine(t)
	res := runCompose(t, f, composeRules, true, true)
	if got := f.changes(); len(got) != 0 {
		t.Fatalf("a dry run changed the engine: %q", got)
	}
	want := []string{
		"compose_container a1:abandoned", "compose_container a2:abandoned",
		"compose_network example-1_default:abandoned", "compose_project example-1:abandoned",
		"compose_volume example-1_data:abandoned",
	}
	if got := kindsAndNames(res.Removed); !slices.Equal(got, want) {
		t.Fatalf("planned %q, want %q", got, want)
	}
}

func TestComposeRemovesAbandonedProject(t *testing.T) {
	f, _ := composeEngine(t)
	res := runCompose(t, f, composeRules, true, false)
	if len(res.Failures) != 0 {
		t.Fatalf("failures %v", res.Failures)
	}
	wantCalls := []string{
		"POST /containers/a1/stop", "DELETE /containers/a1", "DELETE /containers/a2",
		"DELETE /networks/net1", "DELETE /volumes/example-1_data",
	}
	if got := f.changes(); !slices.Equal(got, wantCalls) {
		t.Fatalf("calls %q, want %q", got, wantCalls)
	}
	wantKept := []string{
		"compose_project example-2:live", "compose_project example-3:live", "compose_project example-4:live",
	}
	if got := kindsAndNames(res.Kept); !slices.Equal(got, wantKept) {
		t.Fatalf("kept %q, want %q", got, wantKept)
	}
}

func TestComposeKeepsVolumesWithoutTheRule(t *testing.T) {
	f, _ := composeEngine(t)
	runCompose(t, f, []ComposeRule{{Project: "example-*"}}, true, false)
	for _, c := range f.changes() {
		if c == "DELETE /volumes/example-1_data" {
			t.Fatal("removed a volume the rule does not cover")
		}
	}
}

func TestComposeInUseAndFailures(t *testing.T) {
	f, _ := composeEngine(t)
	f.status["DELETE /volumes/example-1_data"] = 409
	f.status["DELETE /networks/net1"] = 500
	res := runCompose(t, f, composeRules, true, false)
	if len(res.Failures) != 1 || res.Failures[0].Code != report.CodeRemovalFailed {
		t.Fatalf("failures %v; want one removal-failed for the network", res.Failures)
	}
	want := []string{"compose_network example-1_default:removal-failed", "compose_volume example-1_data:in-use"}
	var got []string
	for _, it := range res.Kept {
		if it.Kind != KindComposeProject {
			got = append(got, it.Kind+" "+it.Name+":"+it.Reason)
		}
	}
	slices.Sort(got)
	if !slices.Equal(got, want) {
		t.Fatalf("kept %q, want %q", got, want)
	}
}

func TestComposeStopsAtAContainerItCannotRemove(t *testing.T) {
	f, _ := composeEngine(t)
	f.status["DELETE /containers/a1"] = 409
	runCompose(t, f, composeRules, true, false)
	for _, c := range f.changes() {
		if c == "DELETE /networks/net1" || c == "DELETE /volumes/example-1_data" {
			t.Fatalf("went on to %s after a container stayed", c)
		}
	}
}
