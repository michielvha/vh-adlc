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

// gateCommands are the checks CI runs on every pull request and the release
// runs before publishing.
var gateCommands = []string{
	`test -z "$(gofmt -l .)"`,
	"go vet ./...",
	"go test ./...",
	"go build ./cmd/vh-adlc",
	"golangci-lint config verify",
	"golangci-lint run",
}

type step struct {
	ID   string            `yaml:"id"`
	If   string            `yaml:"if"`
	Uses string            `yaml:"uses"`
	Run  string            `yaml:"run"`
	With map[string]string `yaml:"with"`
}

type workflow struct {
	On   yaml.Node `yaml:"on"`
	Jobs map[string]struct {
		Needs any    `yaml:"needs"`
		Steps []step `yaml:"steps"`
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

var pinned = regexp.MustCompile(`^[\w.-]+/[\w.-]+@[0-9a-f]{40}$`)

func checkPins(t *testing.T, name string, w workflow) {
	t.Helper()
	for job, j := range w.Jobs {
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
	got := runs(w)
	for _, c := range gateCommands {
		if !slices.Contains(got, c) {
			t.Errorf("ci.yml does not run %q", c)
		}
	}
	var on map[string]any
	if err := w.On.Decode(&on); err != nil {
		t.Fatal(err)
	}
	if _, ok := on["pull_request"]; !ok {
		t.Error("ci.yml does not run on pull requests")
	}
	if _, ok := on["push"]; !ok {
		t.Error("ci.yml does not run on pushes")
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
