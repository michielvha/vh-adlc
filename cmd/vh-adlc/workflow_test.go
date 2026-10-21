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
	var on map[string]yaml.Node
	if err := w.On.Decode(&on); err != nil {
		t.Fatal(err)
	}
	if _, ok := on["pull_request"]; ok {
		t.Error("CI runs on branch pushes so GitVersion sees the real branch, not the PR merge ref")
	}
	if _, ok := on["push"]; !ok {
		t.Error("ci.yml does not run on pushes")
	}
	verify := w.Jobs["verify"]
	if len(verify.Steps) != 2 || !strings.HasPrefix(verify.Steps[1].Uses, "michielvha/go-ci-action@") {
		t.Error("CI-only verification is checkout plus the Go CI action, nothing else")
	}
	if !slices.Contains(runs(w), "bun test tests/vh-adlc") {
		t.Error("CI must retain the existing plugin checker")
	}
	if _, ok := w.Jobs["release-gate"]; ok {
		t.Error("the shared version workflow decides when to tag; the caller has no gate of its own")
	}
	version := w.Jobs["version"]
	if !strings.HasPrefix(version.Uses, "vhco-pro/version-workflow/.github/workflows/version.yml@") ||
		!slices.Equal(dependencies(t, version.Needs), []string{"verify", "checker", "checker-macos"}) {
		t.Error("versioning must call the shared version workflow after every check, through native needs")
	}
	if _, ok := version.With["dry-run"]; ok {
		t.Error("the caller must not override the shared tag decision")
	}
	if version.Permissions["contents"] != "read" || version.Permissions["pull-requests"] != "read" {
		t.Error("the version job reads PRs for the preview label; the App, not GITHUB_TOKEN, pushes the tag")
	}
	if version.Secrets["release-app-private-key"] != "${{ secrets.RELEASE_APP_PRIVATE_KEY }}" {
		t.Error("only the version job receives the App key")
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
	if !ok || !strings.HasPrefix(release.Uses, "vhco-pro/go-release-workflow/.github/workflows/go-release.yml@") ||
		len(release.Steps) != 0 {
		t.Fatal("release.yml must be a thin caller of the shared Go release workflow")
	}
	if release.Permissions["contents"] != "write" ||
		release.Secrets["pgp-private-key"] != "${{ secrets.PGP_PRIVATE_KEY }}" {
		t.Error("the release caller must explicitly grant its required token permission and signing secret")
	}
}

func TestPreviewWorkflow(t *testing.T) {
	w, _ := readWorkflow(t, "preview.yml")
	request := w.Jobs["request"]
	if !strings.Contains(request.If, "release:preview") ||
		!strings.Contains(request.If, "head.repo.full_name == github.repository") {
		t.Error("only adding release:preview to a same-repository PR reruns branch CI")
	}
	if request.Permissions["actions"] != "write" || len(request.Steps) != 1 ||
		!strings.Contains(request.Steps[0].Run, "gh workflow run ci.yml") {
		t.Error("the label request only reruns CI on the PR branch")
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
