package clean

import (
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/testrepo"
)

const repoManifest = `schema_version: 1
project: example
temp_root: {max_age: 24h}
tmp:
  - {glob: "example-run-*", max_age: 12h}
compose:
  - {project: "example-*", volumes: true}
`

// cleanFixture is a repository whose origin/main holds a manifest, a fake
// host and, unless absent, a fake engine.
type cleanFixture struct {
	t      *testing.T
	repo   *testrepo.Repo
	host   *fakeHost
	engine *fakeEngine
	dirs   hostDirs
}

func newCleanFixture(t *testing.T, manifest string) *cleanFixture {
	t.Helper()
	c := &cleanFixture{t: t, repo: testrepo.New(t), host: newFakeHost(t), engine: newFakeEngine(t)}
	c.repo.Write("README.md", "fixture\n")
	if manifest != "" {
		c.repo.Write(ManifestPath, manifest)
	}
	c.repo.Commit("fixture")
	c.repo.AddRemote()
	c.dirs = hostDirs{home: c.repo.Home, config: filepath.Join(c.repo.Home, ".config"), tmp: c.host.tmp}
	return c
}

func (c *cleanFixture) options() Options {
	return Options{
		Repo:         c.repo.Dir,
		GOOS:         "linux",
		EUID:         1000,
		PIDNamespace: func() (string, error) { return initialPIDNamespace, nil },
		GitEnv:       testrepo.Env(c.repo.Home),
		Host:         HostPaths{ConfigDir: c.dirs.config, Home: c.dirs.home, Tmp: c.host.tmp, UID: os.Getuid()},
		Files:        c.host.files(),
		DockerHost:   "unix://" + c.engine.socket,
		KindHost:     (&kindFake{}).host(),
	}
}

func runClean(t *testing.T, o Options) (*report.Report, Data) {
	t.Helper()
	rep := Clean(t.Context(), o)
	if rep.Knowledge != nil || rep.Command != "clean" {
		t.Fatalf("report header: %+v", rep)
	}
	data, _ := rep.Data.(Data)
	return rep, data
}

func codes(rep *report.Report) []string {
	var out []string
	for _, f := range rep.Findings {
		out = append(out, f.Code)
	}
	slices.Sort(out)
	return out
}

func names(items []Item) []string {
	var out []string
	for _, it := range items {
		out = append(out, filepath.Base(it.Name))
	}
	slices.Sort(out)
	return out
}

func TestCleanRefusals(t *testing.T) {
	cases := []struct {
		name   string
		change func(o *Options)
		code   string
	}{
		{"outside Linux", func(o *Options) { o.GOOS = "darwin" }, report.CodeUnsupportedPlatform},
		{"as root", func(o *Options) { o.EUID = 0 }, report.CodeRunningAsRoot},
		{"in a PID namespace", func(o *Options) {
			o.PIDNamespace = func() (string, error) { return "pid:[4026535966]", nil }
		}, report.CodePIDNamespace},
		{"PID namespace unreadable", func(o *Options) {
			o.PIDNamespace = func() (string, error) { return "", errors.New("denied") }
		}, report.CodePIDNamespace},
		{"Git 2.44", func(o *Options) { o.GitVersion = func() string { return "git version 2.44.2" } }, report.CodeGitTooOld},
	}
	for _, tc := range cases {
		for _, dry := range []bool{false, true} {
			t.Run(tc.name, func(t *testing.T) {
				c := newCleanFixture(t, repoManifest)
				c.host.entry("go-build1", 30*time.Hour)
				before := snapshot(t, c.host.outer)
				o := c.options()
				o.DryRun = dry
				tc.change(&o)
				rep, _ := runClean(t, o)
				if rep.Result != report.Error || !slices.Equal(codes(rep), []string{tc.code}) || rep.Data != nil {
					t.Fatalf("got %+v; want error with %s", rep, tc.code)
				}
				if snapshot(t, c.host.outer) != before || len(c.engine.recorded()) != 0 {
					t.Fatalf("a refused run touched the host or the engine: %q", c.engine.recorded())
				}
			})
		}
	}
}

func TestCleanAppliedRun(t *testing.T) {
	c := newCleanFixture(t, repoManifest)
	c.host.entry("go-build1", 30*time.Hour)
	c.host.entry("example-run-a", 13*time.Hour)
	c.host.entry("example-run-new", time.Hour)
	c.host.entry("unrelated", 30*time.Hour)
	c.engine.containers = []container{composeContainer("a1", "example-1", filepath.Join(c.host.outer, "gone"), "running")}

	rep, data := runClean(t, c.options())
	if rep.Result != report.Pass || len(rep.Findings) != 0 {
		t.Fatalf("result %s, findings %v", rep.Result, rep.Findings)
	}
	if got := names(data.Removed); !slices.Equal(got, []string{"example-run-a", "go-build1"}) {
		t.Fatalf("removed %q", got)
	}
	if data.FreedBytes <= 0 || data.Unmatched.Count != 1 || data.DryRun {
		t.Fatalf("freed %d, unmatched %+v, dry %v", data.FreedBytes, data.Unmatched, data.DryRun)
	}
	if got := kindsAndNames(data.NeedsFlag); !slices.Equal(got, []string{"compose_project example-1:needs --compose"}) {
		t.Fatalf("needs flag %q", got)
	}
	if got := c.engine.changes(); len(got) != 0 {
		t.Fatalf("changed the engine without a flag: %q", got)
	}
	for _, name := range []string{"go-build1", "example-run-a"} {
		if _, err := os.Lstat(filepath.Join(c.host.tmp, name)); !os.IsNotExist(err) {
			t.Errorf("%s remains: %v", name, err)
		}
	}
}

func TestCleanDryRunChangesNothing(t *testing.T) {
	c := newCleanFixture(t, repoManifest)
	c.host.entry("go-build1", 30*time.Hour)
	c.host.entry("example-run-a", 13*time.Hour)
	c.engine.containers = []container{composeContainer("a1", "example-1", filepath.Join(c.host.outer, "gone"), "running")}
	before := snapshot(t, c.host.outer)
	o := c.options()
	o.DryRun, o.Compose, o.Kind = true, true, true
	rep, data := runClean(t, o)
	if rep.Result != report.Answered || len(rep.Findings) != 0 || !data.DryRun {
		t.Fatalf("result %s, findings %v", rep.Result, rep.Findings)
	}
	if snapshot(t, c.host.outer) != before || len(c.engine.changes()) != 0 {
		t.Fatalf("a dry run changed something: %q", c.engine.changes())
	}
	if b, err := json.Marshal(data); err != nil || strings.Contains(string(b), "null") {
		t.Fatalf("data %s, %v: an empty list must print as []", b, err)
	}
	if got := names(data.Removed); !slices.Equal(got, []string{"a1", "example-1", "example-run-a", "go-build1"}) {
		t.Fatalf("would remove %q", got)
	}
}

// TestManifestSources covers AC-05: a branch edit and an uncommitted edit are
// planned by a dry run as unmerged, and never used by an applied run.
func TestManifestSources(t *testing.T) {
	wider := strings.Replace(repoManifest, "tmp:\n  - {glob: \"example-run-*\", max_age: 12h}\n", "tmp:\n  - {glob: \"example-run-*\", max_age: 12h}\n  - {glob: \"example-more-*\", max_age: 2h}\n", 1)
	for _, how := range []string{"branch commit", "uncommitted"} {
		t.Run(how, func(t *testing.T) {
			c := newCleanFixture(t, repoManifest)
			c.repo.Write(ManifestPath, wider)
			if how == "branch commit" {
				c.repo.Git("switch", "-q", "-c", "topic")
				c.repo.Commit("widen the manifest")
			}
			c.host.entry("example-more-x", 30*time.Hour)
			c.host.entry("example-run-a", 30*time.Hour)

			o := c.options()
			o.DryRun = true
			rep, data := runClean(t, o)
			if rep.Result != report.Answered || !slices.Equal(codes(rep), []string{report.CodeManifestUnmerged}) {
				t.Fatalf("dry run: %s %v", rep.Result, rep.Findings)
			}
			if got := names(data.Removed); !slices.Equal(got, []string{"example-run-a"}) {
				t.Fatalf("dry run default-branch plan %q", got)
			}
			if got := names(data.Unmerged); !slices.Equal(got, []string{"example-more-x"}) {
				t.Fatalf("dry run unmerged plan %q", got)
			}

			rep, data = runClean(t, c.options())
			if rep.Result != report.Pass || len(rep.Findings) != 0 || len(data.Unmerged) != 0 {
				t.Fatalf("applied: %s %v %v", rep.Result, rep.Findings, data.Unmerged)
			}
			if _, err := os.Lstat(filepath.Join(c.host.tmp, "example-more-x")); err != nil {
				t.Fatalf("an applied run used the unmerged rule: %v", err)
			}
		})
	}
}

// TestInvalidWorkingTreeManifestIsANote covers AC-05 and the owner's answer
// to Q3: a dry run reports an invalid working-tree manifest as a
// manifest-unmerged note naming the refusal, plans nothing from it and does
// not fail, while the default-branch rules still apply.
func TestInvalidWorkingTreeManifestIsANote(t *testing.T) {
	c := newCleanFixture(t, repoManifest)
	c.repo.Write(ManifestPath, "schema_version: 2\nproject: example\n")
	c.host.entry("example-run-a", 30*time.Hour)

	o := c.options()
	o.DryRun = true
	rep, data := runClean(t, o)
	if rep.Result != report.Answered || !slices.Equal(codes(rep), []string{report.CodeManifestUnmerged}) {
		t.Fatalf("dry run: %s %v; want answered with one manifest-unmerged note", rep.Result, rep.Findings)
	}
	if msg := rep.Findings[0].Message; !strings.Contains(msg, "schema_version") {
		t.Fatalf("the note does not name the refusal: %q", msg)
	}
	if len(data.Unmerged) != 0 {
		t.Fatalf("a dry run planned an invalid working-tree manifest: %v", names(data.Unmerged))
	}
	if got := names(data.Removed); !slices.Equal(got, []string{"example-run-a"}) {
		t.Fatalf("dry run default-branch plan %q", got)
	}

	rep, _ = runClean(t, c.options())
	if rep.Result != report.Pass || len(rep.Findings) != 0 {
		t.Fatalf("applied: %s %v", rep.Result, rep.Findings)
	}
	if _, err := os.Lstat(filepath.Join(c.host.tmp, "example-run-a")); !os.IsNotExist(err) {
		t.Fatalf("the applied run did not apply the default-branch rule: %v", err)
	}
}

// TestPartialCloneDoesNotFetch has a manifest blob missing from a partial
// clone. The run must not fetch it, so it reads the manifest as unusable.
func TestPartialCloneDoesNotFetch(t *testing.T) {
	c := newCleanFixture(t, repoManifest)
	bare := strings.TrimSpace(c.repo.Git("remote", "get-url", "origin"))
	env := testrepo.Env(c.repo.Home)
	gitIn := func(dir string, args ...string) (string, error) {
		cmd := exec.Command("git", args...)
		cmd.Dir, cmd.Env = dir, env
		out, err := cmd.CombinedOutput()
		return string(out), err
	}
	if out, err := gitIn(bare, "config", "uploadpack.allowFilter", "true"); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	clone := filepath.Join(t.TempDir(), "clone")
	if out, err := gitIn(c.repo.Dir, "clone", "-q", "--filter=blob:none", "--no-checkout", "file://"+bare, clone); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	blob, err := gitIn(clone, "rev-parse", "origin/main:"+ManifestPath)
	if err != nil {
		t.Fatalf("%v: %s", err, blob)
	}
	blob = strings.TrimSpace(blob)
	missing := func() bool {
		cmd := exec.Command("git", "cat-file", "-e", blob)
		cmd.Dir, cmd.Env = clone, slices.Concat(env, []string{"GIT_NO_LAZY_FETCH=1"})
		return cmd.Run() != nil
	}
	if !missing() {
		t.Fatal("the fixture blob is already present")
	}
	o := c.options()
	o.Repo, o.DryRun = clone, true
	rep, _ := runClean(t, o)
	if !slices.Contains(codes(rep), report.CodeManifestInvalid) {
		t.Fatalf("codes %v; want manifest-invalid", codes(rep))
	}
	if !missing() {
		t.Fatal("the run fetched the missing blob")
	}
}

func TestEngineListingGatesFileRemoval(t *testing.T) {
	cases := []struct {
		name    string
		setup   func(c *cleanFixture, o *Options)
		removed bool
		result  report.Result
		codes   []string
	}{
		{"failed listing", func(c *cleanFixture, _ *Options) { c.engine.status["GET /containers/json"] = 500 }, false, report.Fail, []string{report.CodeEngineUnreachable}},
		{"denied socket", func(c *cleanFixture, _ *Options) {
			if err := os.Chmod(c.engine.socket, 0); err != nil {
				c.t.Fatal(err)
			}
		}, false, report.Fail, []string{report.CodeEngineUnreachable}},
		{"absent socket", func(c *cleanFixture, o *Options) {
			o.DockerHost = "unix://" + filepath.Join(c.host.outer, "absent.sock")
		}, true, report.Pass, []string{report.CodeEngineAbsent}},
		{"tcp DOCKER_HOST", func(_ *cleanFixture, o *Options) { o.DockerHost = "tcp://127.0.0.1:1" }, true, report.Pass, []string{report.CodeEngineAbsent}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := newCleanFixture(t, repoManifest)
			c.host.entry("go-build1", 30*time.Hour)
			o := c.options()
			tc.setup(c, &o)
			rep, _ := runClean(t, o)
			if rep.Result != tc.result || !slices.Equal(codes(rep), tc.codes) {
				t.Fatalf("got %s %v; want %s %v", rep.Result, codes(rep), tc.result, tc.codes)
			}
			_, err := os.Lstat(filepath.Join(c.host.tmp, "go-build1"))
			if gone := os.IsNotExist(err); gone != tc.removed {
				t.Fatalf("go-build1 removed = %v, want %v", gone, tc.removed)
			}
		})
	}
}

// TestResults is the table from every finding code to its result and exit
// code, for applied runs and dry runs (R-6 F-08, R-7 F-04). A failing code
// fails a dry run too, so the operation never applies after it.
func TestResults(t *testing.T) {
	type run struct {
		name     string
		manifest string
		setup    func(c *cleanFixture, o *Options)
		code     string
		applied  report.Result
		dry      report.Result
		dryCodes []string // when a dry run adds a note
	}
	runs := []run{
		{"clean", repoManifest, nil, "", report.Pass, report.Answered, nil},
		{"no manifest", "", nil, report.CodeManifestMissing, report.Pass, report.Answered, nil},
		{"no default branch", repoManifest, func(c *cleanFixture, _ *Options) {
			c.repo.Git("remote", "set-head", "origin", "--delete")
		}, report.CodeDefaultBranchUnknown, report.Pass, report.Answered, []string{report.CodeDefaultBranchUnknown, report.CodeManifestUnmerged}},
		{"no engine", repoManifest, func(c *cleanFixture, o *Options) {
			o.DockerHost = "unix://" + filepath.Join(c.host.outer, "absent.sock")
		}, report.CodeEngineAbsent, report.Pass, report.Answered, nil},
		{"invalid manifest", "schema_version: 2\nproject: example\n", nil, report.CodeManifestInvalid, report.Fail, report.Fail, nil},
		{"invalid working-tree manifest", repoManifest, func(c *cleanFixture, _ *Options) {
			c.repo.Write(ManifestPath, "schema_version: 2\nproject: example\n")
		}, "", report.Pass, report.Answered, []string{report.CodeManifestUnmerged}},
		{"invalid host.yaml", repoManifest, func(c *cleanFixture, _ *Options) {
			c.dirs.writeHost(c.t, "temp_base: relative\n")
		}, report.CodeHostSettingsInvalid, report.Fail, report.Fail, nil},
		{"refused base", repoManifest, func(c *cleanFixture, _ *Options) {
			if err := os.MkdirAll(c.host.base, 0o777); err != nil {
				c.t.Fatal(err)
			}
			if err := os.Chmod(c.host.base, 0o777); err != nil {
				c.t.Fatal(err)
			}
		}, report.CodeTempBaseRefused, report.Fail, report.Fail, nil},
		{"unreachable engine", repoManifest, func(c *cleanFixture, _ *Options) {
			c.engine.status["GET /containers/json"] = 500
		}, report.CodeEngineUnreachable, report.Fail, report.Fail, nil},
		{"kind missing", "schema_version: 1\nproject: example\nkind:\n  - {cluster: example-e2e, liveness: {kind: pid, label: example.kind-run}}\n", func(c *cleanFixture, o *Options) {
			o.KindHost = (&kindFake{missing: true}).host()
			c.engine.containers = []container{node("n1", "example-e2e", "running")}
			c.engine.volumes = []volume{mark("m1", "example-e2e", "this-host/1")}
		}, report.CodeKindUnavailable, report.Fail, report.Fail, nil},
	}
	for _, r := range runs {
		for _, dry := range []bool{false, true} {
			want := r.applied
			if dry {
				want = r.dry
			}
			t.Run(r.name, func(t *testing.T) {
				c := newCleanFixture(t, r.manifest)
				o := c.options()
				o.DryRun, o.Kind = dry, true
				if r.setup != nil {
					r.setup(c, &o)
				}
				rep, _ := runClean(t, o)
				var wantCodes []string
				if r.code != "" {
					wantCodes = []string{r.code}
				}
				if dry && r.dryCodes != nil {
					wantCodes = r.dryCodes
				}
				if rep.Result != want || !slices.Equal(codes(rep), wantCodes) {
					t.Fatalf("dry=%v: %s %v; want %s %v", dry, rep.Result, codes(rep), want, wantCodes)
				}
				wantExit := map[report.Result]int{report.Pass: 0, report.Answered: 0, report.Fail: 1, report.Error: 4}[want]
				if rep.Result.ExitCode() != wantExit {
					t.Fatalf("exit %d, want %d", rep.Result.ExitCode(), wantExit)
				}
			})
		}
	}

	t.Run("removal failed", func(t *testing.T) {
		c := newCleanFixture(t, repoManifest)
		dir := c.host.entry("go-build1", 30*time.Hour)
		if err := os.Chmod(dir, 0o500); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.Chmod(dir, 0o755) })
		c.host.age(dir, 30*time.Hour)
		rep, data := runClean(t, c.options())
		if rep.Result != report.Fail || !slices.Equal(codes(rep), []string{report.CodeRemovalFailed}) || rep.Result.ExitCode() != 1 {
			t.Fatalf("%s %v", rep.Result, codes(rep))
		}
		if len(data.Kept) != 1 || data.Kept[0].Reason != ReasonRemovalFailed {
			t.Fatalf("kept %+v", data.Kept)
		}
	})
}
