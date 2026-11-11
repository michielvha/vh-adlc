//go:build engine

// The real-engine proof for AC-03 and AC-08. It runs only with
// `go test -tags engine ./internal/clean`, on a host whose owner chooses to,
// and touches only objects it creates under a unique vhclean-<n> name. The kind
// case also needs VH_ADLC_ENGINE_KIND=1 and kind on PATH.

package clean

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

func engineImage() string {
	if img := os.Getenv("VH_ADLC_ENGINE_IMAGE"); img != "" {
		return img
	}
	return "busybox:1.36"
}

func docker(t *testing.T, args ...string) string {
	t.Helper()
	out, err := exec.Command("docker", args...).CombinedOutput()
	if err != nil {
		t.Fatalf("docker %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return strings.TrimSpace(string(out))
}

func realEngine(t *testing.T) *Engine {
	t.Helper()
	socket, ok := ResolveSocket(os.Getenv("DOCKER_HOST"))
	if !ok {
		t.Skip("DOCKER_HOST is not a Unix socket")
	}
	return NewEngine(socket)
}

// TestRealEngineCompose builds two disposable Compose-labelled projects, one
// whose working directory is gone and one whose directory is present, and
// checks that only the first goes, with no forced removal.
func TestRealEngineCompose(t *testing.T) {
	e := realEngine(t)
	prefix := fmt.Sprintf("vhclean-%d", time.Now().UnixNano())
	gone, present := filepath.Join(t.TempDir(), "gone"), t.TempDir()
	label := func(project, dir string) []string {
		return []string{"--label", composeProjectLabel + "=" + project, "--label", composeWorkDirLabel + "=" + dir}
	}
	dead, live := prefix+"-dead", prefix+"-live"
	t.Cleanup(func() {
		for _, p := range []string{dead, live} {
			_ = exec.Command("sh", "-c", "docker rm -f $(docker ps -aq --filter label="+composeProjectLabel+"="+p+") 2>/dev/null; docker network rm "+p+"_default 2>/dev/null; docker volume rm "+p+"_data 2>/dev/null").Run()
		}
	})
	for _, p := range []struct{ name, dir string }{{dead, gone}, {live, present}} {
		docker(t, "network", "create", "--label", composeProjectLabel+"="+p.name, p.name+"_default")
		docker(t, "volume", "create", "--label", composeProjectLabel+"="+p.name, p.name+"_data")
		docker(t, append(append([]string{"run", "-d", "--network", p.name + "_default", "-v", p.name + "_data:/data"}, label(p.name, p.dir)...), engineImage(), "sleep", "300")...)
	}

	state, err := listEngine(t.Context(), e)
	if err != nil {
		t.Fatal(err)
	}
	res := doCompose(t.Context(), e, state, []ComposeRule{{Project: prefix + "-*", Volumes: true}}, true, false)
	if len(res.Failures) != 0 {
		t.Fatalf("failures %v", res.Failures)
	}
	if got := docker(t, "ps", "-aq", "--filter", "label="+composeProjectLabel+"="+dead); got != "" {
		t.Errorf("the abandoned project's containers remain: %s", got)
	}
	if got := docker(t, "volume", "ls", "-q", "--filter", "name="+dead+"_data"); got != "" {
		t.Errorf("the abandoned project's volume remains")
	}
	if got := docker(t, "ps", "-q", "--filter", "label="+composeProjectLabel+"="+live); got == "" {
		t.Errorf("the live project's container is gone")
	}
	if !slices.ContainsFunc(res.Kept, func(it Item) bool { return it.Name == live && it.Reason == ReasonLive }) {
		t.Errorf("kept %v", res.Kept)
	}
}

// TestRealEngineKind creates a disposable kind cluster with an ended mark and
// checks that --kind deletes it, and that the same cluster with no mark stays.
func TestRealEngineKind(t *testing.T) {
	if os.Getenv("VH_ADLC_ENGINE_KIND") != "1" {
		t.Skip("set VH_ADLC_ENGINE_KIND=1 to create a disposable kind cluster")
	}
	e := realEngine(t)
	host := realKindHost()
	kind, err := host.LookPath("kind")
	if err != nil {
		t.Skip("kind is not on PATH")
	}
	name := fmt.Sprintf("vhclean-%d", time.Now().Unix()%1000000)
	t.Cleanup(func() { _ = exec.Command(kind, "delete", "cluster", "--name", name).Run() })
	if out, err := exec.Command(kind, "create", "cluster", "--name", name).CombinedOutput(); err != nil {
		t.Fatalf("kind create: %v\n%s", err, out)
	}
	rules := []KindRule{{Cluster: name, Liveness: Liveness{Kind: LivenessPID, Label: "vhclean.kind-run"}}}

	state, err := listEngine(t.Context(), e)
	if err != nil {
		t.Fatal(err)
	}
	if res := doKind(t.Context(), e, state, rules, host, true, false); !slices.ContainsFunc(res.Kept, func(it Item) bool { return it.Name == name && it.Reason == ReasonUnmarked }) {
		t.Fatalf("an unmarked cluster was not kept: %+v", res)
	}

	// A pid that has ended: a finished child of this test.
	child := exec.Command("true")
	if err := child.Run(); err != nil {
		t.Fatal(err)
	}
	markName := name + "-mark"
	docker(t, "volume", "create", "--label", kindClusterLabel+"="+name, "--label", fmt.Sprintf("vhclean.kind-run=%s/%d", host.Hostname, child.Process.Pid), markName)
	t.Cleanup(func() { _ = exec.Command("docker", "volume", "rm", markName).Run() })
	state, err = listEngine(t.Context(), e)
	if err != nil {
		t.Fatal(err)
	}
	res := doKind(t.Context(), e, state, rules, host, true, false)
	if len(res.Failures) != 0 {
		t.Fatalf("failures %v", res.Failures)
	}
	if got := docker(t, "ps", "-aq", "--filter", "label="+kindClusterLabel+"="+name); got != "" {
		t.Errorf("the cluster's nodes remain: %s", got)
	}
	if got := docker(t, "volume", "ls", "-q", "--filter", "name="+markName); got != "" {
		t.Errorf("the mark remains")
	}
}
