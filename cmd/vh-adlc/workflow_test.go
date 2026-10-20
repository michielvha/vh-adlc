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
	ID    string            `yaml:"id"`
	If    string            `yaml:"if"`
	Uses  string            `yaml:"uses"`
	Run   string            `yaml:"run"`
	Shell string            `yaml:"shell"`
	With  map[string]string `yaml:"with"`
	Env   map[string]string `yaml:"env"`
}

type workflow struct {
	On          yaml.Node         `yaml:"on"`
	Permissions map[string]string `yaml:"permissions"`
	Jobs        map[string]struct {
		Needs       yaml.Node         `yaml:"needs"`
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
	w, _ := readWorkflow(t, "ci.yml")
	checkPins(t, "ci.yml", w)
	verify, ok := w.Jobs["verify"]
	if !ok || verify.Uses != "" {
		t.Fatal("CI-only runs must call the Go CI action directly, not another shared workflow")
	}
	goCI := 0
	for _, s := range verify.Steps {
		if strings.HasPrefix(s.Uses, "michielvha/go-ci-action@") {
			goCI++
		}
		if strings.HasPrefix(s.Uses, "goreleaser/goreleaser-action@") {
			if s.If != "${{ github.event_name == 'pull_request' || github.ref == 'refs/heads/main' }}" {
				t.Error("plain feature pushes must run CI without PR packaging work")
			}
			for _, flag := range []string{"--snapshot", "--clean", "--skip=publish,sign"} {
				if !strings.Contains(s.With["args"], flag) {
					t.Errorf("non-publishing packaging check lacks %s", flag)
				}
			}
		}
	}
	if goCI != 1 {
		t.Error("CI-only verification must call the public Go CI action once")
	}
	if !slices.Contains(runs(w), "bun test tests/vh-adlc") {
		t.Error("CI must retain the existing plugin checker")
	}
	for _, name := range []string{"verify", "checker", "checker-macos"} {
		job, exists := w.Jobs[name]
		if !exists || !slices.Equal(dependencies(t, job.Needs), []string{"route"}) ||
			job.If != "${{ needs.route.outputs.run == 'true' }}" {
			t.Errorf("%s must honor the caller's duplicate-event routing", name)
		}
	}
	for _, name := range []string{"verify", "checker", "checker-macos"} {
		if len(w.Jobs[name].Secrets) != 0 {
			t.Errorf("%s must not receive production credentials", name)
		}
		for _, s := range w.Jobs[name].Steps {
			if strings.HasPrefix(s.Uses, "actions/checkout@") &&
				(s.With["ref"] != "${{ github.event.pull_request.head.sha || github.sha }}" ||
					s.With["persist-credentials"] != "false") {
				t.Errorf("%s must check the exact source without persisted credentials", name)
			}
			for _, value := range s.Env {
				if strings.Contains(value, "PRIVATE_KEY") {
					t.Errorf("%s receives a production key", name)
				}
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
	for _, name := range []string{"version", "preview"} {
		if !slices.Equal(dependencies(t, w.Jobs[name].Needs), []string{"verify", "checker", "checker-macos"}) {
			t.Errorf("%s must wait for all checks through native needs", name)
		}
	}
	if !strings.Contains(w.Jobs["version"].If, "github.event_name == 'push'") ||
		!strings.Contains(w.Jobs["version"].If, "refs/heads/main") {
		t.Error("automatic stable versioning belongs to successful main checks")
	}
	if !strings.Contains(w.Jobs["preview"].If, "release:preview") ||
		!strings.Contains(w.Jobs["preview"].If, "github.event.pull_request.head.repo.full_name == github.repository") {
		t.Error("preview requests require a label-enabled same-repository PR")
	}
}

func dependencies(t *testing.T, node yaml.Node) []string {
	t.Helper()
	if node.Kind == yaml.ScalarNode {
		return []string{node.Value}
	}
	var names []string
	if err := node.Decode(&names); err != nil {
		t.Fatal(err)
	}
	return names
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
		WorkflowDispatch struct {
			Inputs map[string]struct {
				Default yaml.Node `yaml:"default"`
			} `yaml:"inputs"`
		} `yaml:"workflow_dispatch"`
	}
	if err := w.On.Decode(&on); err != nil {
		t.Fatal(err)
	}
	if on.WorkflowDispatch.Inputs["dry-run"].Default.Value != "true" {
		t.Error("manual version calculation must default to dry-run")
	}
	var triggers map[string]yaml.Node
	if err := w.On.Decode(&triggers); err != nil {
		t.Fatal(err)
	}
	if len(triggers) != 1 {
		t.Error("the Version entry point must only accept branch-native dispatch")
	}
	version, ok := w.Jobs["version"]
	if !ok || !strings.HasPrefix(version.Uses, "vhco-pro/.github/.github/workflows/reusable-version.yml@") ||
		len(version.Steps) != 0 {
		t.Fatal("versioning must be a thin caller of shared orchestration, not local tagging logic")
	}
	if version.Permissions["contents"] != "read" ||
		!slices.Equal(dependencies(t, version.Needs), []string{"eligibility"}) ||
		version.If != "${{ needs.eligibility.outputs.allowed == 'true' }}" {
		t.Error("versioning must follow the caller's eligibility check with read-only base permissions")
	}
	if version.With["release-app-client-id"] != "${{ vars.RELEASE_APP_CLIENT_ID }}" ||
		version.Secrets["release-app-private-key"] != "${{ secrets.RELEASE_APP_PRIVATE_KEY }}" {
		t.Error("only versioning must receive the explicitly named App identity")
	}
	if version.With["dry-run"] != "${{ inputs.dry-run }}" ||
		version.With["expected-sha"] != "${{ inputs.expected-sha || github.sha }}" {
		t.Error("the thin wrapper must receive dry-run and checked source directly")
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
