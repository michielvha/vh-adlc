package main

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"

	"go.yaml.in/yaml/v3"
)

type step struct {
	ID   string            `yaml:"id"`
	If   string            `yaml:"if"`
	Uses string            `yaml:"uses"`
	Run  string            `yaml:"run"`
	With map[string]string `yaml:"with"`
}

type workflow struct {
	On          yaml.Node         `yaml:"on"`
	Permissions map[string]string `yaml:"permissions"`
	Jobs        map[string]struct {
		Needs       any               `yaml:"needs"`
		If          string            `yaml:"if"`
		Uses        string            `yaml:"uses"`
		Permissions map[string]string `yaml:"permissions"`
		Secrets     map[string]string `yaml:"secrets"`
		With        map[string]string `yaml:"with"`
		Steps       []step            `yaml:"steps"`
	} `yaml:"jobs"`
}

func readWorkflow(t *testing.T, name string) (workflow, string) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", ".github", "workflows", name))
	if err != nil {
		t.Fatal(err)
	}
	var w workflow
	if err := yaml.Unmarshal(raw, &w); err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	return w, string(raw)
}

var pinned = regexp.MustCompile(`^[\w.-]+/[\w.-]+(?:/[\w./-]+)?@[0-9a-f]{40}$`)

func checkPins(t *testing.T, name string, w workflow) {
	t.Helper()
	for job, j := range w.Jobs {
		if j.Uses != "" && !pinned.MatchString(j.Uses) {
			t.Errorf("%s job %s: %q is not pinned to a full commit SHA", name, job, j.Uses)
		}
		for _, s := range j.Steps {
			if s.Uses != "" && !pinned.MatchString(s.Uses) {
				t.Errorf("%s job %s: %q is not pinned to a full commit SHA", name, job, s.Uses)
			}
		}
	}
}

func runs(w workflow) []string {
	var out []string
	for _, j := range w.Jobs {
		for _, s := range j.Steps {
			if s.Run != "" {
				out = append(out, strings.TrimSpace(s.Run))
			}
		}
	}
	return out
}

func TestCIWorkflow(t *testing.T) {
	w, raw := readWorkflow(t, "ci.yml")
	checkPins(t, "ci.yml", w)
	verify, ok := w.Jobs["verify"]
	if !ok || !strings.HasPrefix(verify.Uses, "vhco-pro/.github/.github/workflows/reusable-go-ci.yml@") ||
		len(verify.Steps) != 0 {
		t.Fatal("CI verification must call the shared Go checks and non-publishing packaging workflow")
	}
	if verify.With["test-release-packaging"] != "${{ github.event_name == 'pull_request' || github.ref == 'refs/heads/main' }}" {
		t.Error("plain feature pushes must run CI without the PR packaging work")
	}
	if !slices.Contains(runs(w), "bun test tests/vh-adlc") {
		t.Error("CI must retain the existing plugin checker")
	}
	for _, name := range []string{"verify", "checker", "checker-macos"} {
		job, exists := w.Jobs[name]
		if !exists || job.Needs != "route" || job.If != "${{ needs.route.outputs.run == 'true' }}" {
			t.Errorf("%s must honor the caller's duplicate-event routing", name)
		}
	}
	for _, name := range []string{"checker", "checker-macos"} {
		for _, s := range w.Jobs[name].Steps {
			if strings.HasPrefix(s.Uses, "actions/checkout@") &&
				(s.With["ref"] != "${{ github.event.pull_request.head.sha || github.sha }}" ||
					s.With["persist-credentials"] != "false") {
				t.Errorf("%s must check the exact source without persisted credentials", name)
			}
		}
	}
	var on struct {
		Push struct {
			Branches []string `yaml:"branches"`
		} `yaml:"push"`
		PullRequest struct {
			Types []string `yaml:"types"`
		} `yaml:"pull_request"`
	}
	if err := w.On.Decode(&on); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(on.Push.Branches, []string{"**"}) {
		t.Error("this caller opts into CI for feature pushes without an open PR")
	}
	for _, event := range []string{"opened", "reopened", "synchronize", "labeled"} {
		if !slices.Contains(on.PullRequest.Types, event) {
			t.Errorf("PR CI is missing %s", event)
		}
	}
	if strings.Contains(raw, "RELEASE_APP_PRIVATE_KEY") || strings.Contains(raw, "PGP_PRIVATE_KEY") {
		t.Error("CI and snapshots must not receive production credentials")
	}
}

// TestLayout holds the Go conventions' layout: cmd/vh-adlc is wiring only and
// the binary ignore is anchored at the root.
func TestLayout(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		name := e.Name()
		if name == "main.go" || name == "testdata" || strings.HasSuffix(name, "_test.go") {
			continue
		}
		t.Errorf("cmd/vh-adlc holds %s; only main.go, tests and testdata belong there", name)
	}
	f, err := parser.ParseFile(token.NewFileSet(), "main.go", nil, parser.ImportsOnly)
	if err != nil {
		t.Fatal(err)
	}
	for _, imp := range f.Imports {
		path := strings.Trim(imp.Path.Value, `"`)
		if strings.Contains(strings.SplitN(path, "/", 2)[0], ".") && !strings.HasPrefix(path, "github.com/michielvha/vh-adlc/internal/") {
			t.Errorf("main.go imports %s; it may import only the standard library and internal packages", path)
		}
	}
	ignore, err := os.ReadFile(filepath.Join("..", "..", ".gitignore"))
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(string(ignore), "\n")
	if !slices.Contains(lines, "/vh-adlc") || slices.Contains(lines, "vh-adlc") {
		t.Error(".gitignore must ignore the binary as /vh-adlc, anchored at the root")
	}
}

func TestReleaseWorkflow(t *testing.T) {
	w, _ := readWorkflow(t, "release.yml")
	checkPins(t, "release.yml", w)
	var on struct {
		Push *struct {
			Branches []string `yaml:"branches"`
			Paths    []string `yaml:"paths"`
			Tags     []string `yaml:"tags"`
		} `yaml:"push"`
	}
	if err := w.On.Decode(&on); err != nil {
		t.Fatal(err)
	}
	var triggers map[string]yaml.Node
	if err := w.On.Decode(&triggers); err != nil {
		t.Fatal(err)
	}
	if len(triggers) != 1 {
		t.Error("artifact publication must be triggered only by an exact-tag push")
	}
	if on.Push == nil || !slices.Equal(on.Push.Tags, []string{"v*.*.*"}) ||
		len(on.Push.Branches) != 0 || len(on.Push.Paths) != 0 {
		t.Errorf("release.yml push trigger = %+v, want only three-component version tags", on.Push)
	}
	release, ok := w.Jobs["release"]
	if !ok || !strings.HasPrefix(release.Uses, "vhco-pro/.github/.github/workflows/reusable-go-release.yml@") ||
		len(release.Steps) != 0 {
		t.Fatal("release.yml must be a thin caller of the shared Go release workflow")
	}
	if release.Permissions["contents"] != "write" ||
		release.Secrets["pgp-private-key"] != "${{ secrets.PGP_PRIVATE_KEY }}" {
		t.Error("the release caller must explicitly grant its required token permission and signing secret")
	}
}

func TestVersionWorkflow(t *testing.T) {
	w, _ := readWorkflow(t, "version.yml")
	checkPins(t, "version.yml", w)
	var on struct {
		WorkflowRun struct {
			Workflows []string `yaml:"workflows"`
			Types     []string `yaml:"types"`
		} `yaml:"workflow_run"`
		WorkflowDispatch struct {
			Inputs map[string]struct {
				Default yaml.Node `yaml:"default"`
			} `yaml:"inputs"`
		} `yaml:"workflow_dispatch"`
	}
	if err := w.On.Decode(&on); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(on.WorkflowRun.Workflows, []string{"CI"}) ||
		!slices.Equal(on.WorkflowRun.Types, []string{"completed"}) ||
		on.WorkflowDispatch.Inputs["dry-run"].Default.Value != "true" {
		t.Error("versioning must follow complete CI, with manual requests defaulting to dry-run")
	}
	var triggers map[string]yaml.Node
	if err := w.On.Decode(&triggers); err != nil {
		t.Fatal(err)
	}
	if len(triggers) != 2 {
		t.Error("branch-native dispatch and completed CI must be the only versioning entry points")
	}
	version, ok := w.Jobs["version"]
	if !ok || !strings.HasPrefix(version.Uses, "vhco-pro/.github/.github/workflows/reusable-version.yml@") ||
		len(version.Steps) != 0 {
		t.Fatal("versioning must be a thin caller of shared orchestration, not local tagging logic")
	}
	if version.Permissions["contents"] != "read" || version.Permissions["actions"] != "write" ||
		version.Permissions["pull-requests"] != "read" {
		t.Error("the shared workflow must receive its explicit API permissions")
	}
	if version.With["release-app-client-id"] != "${{ vars.RELEASE_APP_CLIENT_ID }}" ||
		version.Secrets["release-app-private-key"] != "${{ secrets.RELEASE_APP_PRIVATE_KEY }}" {
		t.Error("only versioning must receive the explicitly named App identity")
	}
	for _, job := range []string{"verify / verify", "checker", "checker-macos"} {
		if !slices.Contains(strings.Split(version.With["required-jobs"], ","), job) {
			t.Errorf("version requests must require actual execution of %s", job)
		}
	}
}

func TestGoReleaserPublicationPolicy(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", ".goreleaser.yml"))
	if err != nil {
		t.Fatal(err)
	}
	var config struct {
		Release struct {
			Draft                    *bool  `yaml:"draft"`
			Prerelease               string `yaml:"prerelease"`
			UseExistingDraft         bool   `yaml:"use_existing_draft"`
			ReplaceExistingDraft     *bool  `yaml:"replace_existing_draft"`
			ReplaceExistingArtifacts *bool  `yaml:"replace_existing_artifacts"`
		} `yaml:"release"`
	}
	if err := yaml.Unmarshal(raw, &config); err != nil {
		t.Fatal(err)
	}
	if config.Release.Prerelease != "auto" || !config.Release.UseExistingDraft {
		t.Error("GoReleaser must classify prereleases and preserve the original draft")
	}
	for name, value := range map[string]*bool{
		"draft":                      config.Release.Draft,
		"replace_existing_draft":     config.Release.ReplaceExistingDraft,
		"replace_existing_artifacts": config.Release.ReplaceExistingArtifacts,
	} {
		if value == nil || *value {
			t.Errorf("GoReleaser release.%s must explicitly be false", name)
		}
	}
}
