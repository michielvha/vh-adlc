package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/testrepo"
)

var update = flag.Bool("update", false, "rewrite the golden files")

var binary string

func TestMain(m *testing.M) {
	flag.Parse()
	dir, err := os.MkdirTemp("", "vh-adlc-golden-")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	binary = filepath.Join(dir, "vh-adlc")
	if out, err := exec.Command("go", "build", "-o", binary, ".").CombinedOutput(); err != nil {
		fmt.Fprintf(os.Stderr, "building vh-adlc: %v\n%s", err, out)
		os.Exit(1)
	}
	code := m.Run()
	_ = os.RemoveAll(dir)
	os.Exit(code)
}

// docs builds the fixture docs repository: revision A is the pinned standard,
// revision B changes the default document location and adds all_met to the
// planned gate.
func docs(t *testing.T) (dir, a, b string) {
	t.Helper()
	std := testrepo.Standard()
	changed := strings.Replace(std, "default: docs/internal/plans", "default: plans", 1)
	changed = strings.Replace(changed, "planned: [no_open_questions, test_plan_complete, spec_review_fresh, spec_review_clean, accepted, on_feature_branch_if_set]",
		"planned: [no_open_questions, test_plan_complete, spec_review_fresh, spec_review_clean, accepted, all_met, on_feature_branch_if_set]", 1)
	if changed == std {
		t.Fatal("revision B did not change the standard")
	}
	dir, shas := testrepo.DocsRepo(t,
		map[string]string{"conventions/feature-documents.md": std, "guides/humanize-prose.md": "# Humanize prose\n"},
		map[string]string{"conventions/feature-documents.md": changed},
	)
	return dir, shas[0], shas[1]
}

// cmdline puts the command and its arguments first, then the flags.
func cmdline(flags []string, command ...string) []string {
	return append(slices.Clone(command), flags...)
}

type outcome struct {
	stdout []byte
	exit   int
}

func runBinary(t *testing.T, home string, args ...string) outcome {
	t.Helper()
	return runBinaryStdin(t, home, nil, args...)
}

// runBinaryStdin gives the binary stdin. An *os.File is passed as the process's
// own file, so a test can make the read itself fail.
func runBinaryStdin(t *testing.T, home string, stdin io.Reader, args ...string) outcome {
	t.Helper()
	cmd := exec.Command(binary, args...)
	cmd.Env = testrepo.Env(home)
	cmd.Stdin = stdin
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	var exit *exec.ExitError
	switch {
	case err == nil:
		return outcome{stdout: stdout.Bytes()}
	case errors.As(err, &exit):
		return outcome{stdout: stdout.Bytes(), exit: exit.ExitCode()}
	default:
		t.Fatalf("running vh-adlc: %v\n%s", err, stderr.String())
		return outcome{}
	}
}

// documentedExit is the spec's Output table, written out so the test does
// not trust the binary's own mapping.
var documentedExit = map[report.Result]int{
	"answered": 0, "pass": 0, "fail": 1, "usage": 2, "malformed": 3, "local-format": 3,
	"error": 4, "invalid-pin": 5, "missing-page": 5, "unreachable": 5,
}

type goldenCase struct {
	name string
	args []string
}

func checkGolden(t *testing.T, home, stdin string, c goldenCase) {
	t.Helper()
	first := runBinaryStdin(t, home, strings.NewReader(stdin), c.args...)
	second := runBinaryStdin(t, home, strings.NewReader(stdin), c.args...)
	if !bytes.Equal(first.stdout, second.stdout) || first.exit != second.exit {
		t.Fatalf("%s: two runs differ:\n%s\n%s", c.name, first.stdout, second.stdout)
	}
	var result struct {
		Result report.Result `json:"result"`
	}
	if err := json.Unmarshal(first.stdout, &result); err != nil {
		t.Fatalf("%s: output is not one JSON object: %v\n%s", c.name, err, first.stdout)
	}
	if result.Result == report.Usage && c.name != "usage" {
		t.Fatalf("%s: usage error, so the case tests nothing: %s", c.name, first.stdout)
	}
	if want, ok := documentedExit[result.Result]; !ok || first.exit != want {
		t.Fatalf("%s: exit %d, but the Output table gives %d for result %q", c.name, first.exit, want, result.Result)
	}
	path := filepath.Join("testdata", "golden", c.name+".json")
	if *update {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, first.stdout, 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%s: %v (run go test -update to create it)", c.name, err)
	}
	if !bytes.Equal(first.stdout, want) {
		t.Fatalf("%s: output differs from %s:\n got %s\nwant %s", c.name, path, first.stdout, want)
	}
}

func TestGolden(t *testing.T) {
	src, a, b := docs(t)
	common := func(repo string, pin string) []string {
		return []string{"--repo", repo, "--plugin-pin", pin, "--docs-source", src}
	}
	conforming := testrepo.File("docs/conforming.md")

	planned := testrepo.Planned(t, conforming)
	planned.Write("AGENTS.md", "# Agents\n\nFeature documents: docs/\n")
	planned.Commit("declare the feature root")
	returned := filepath.Join(t.TempDir(), "returned.txt")
	if err := os.WriteFile(returned, []byte("NO FINDINGS\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	differs := filepath.Join(t.TempDir(), "differs.txt")
	if err := os.WriteFile(differs, []byte("NO FINDINGS.\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	broken := testrepo.Planned(t, strings.Replace(conforming, "| AC-02 | A written manual procedure |\n", "", 1))
	malformed := testrepo.New(t)
	malformed.Write(testrepo.FeaturePath, strings.Replace(conforming, "## Open Questions\n\nNone.\n", "", 1))
	malformed.Commit("malformed")
	malformed.AddRemote()

	local := testrepo.Planned(t, conforming)
	local.Write("AGENTS.md", "# Agents\n\nFeature document format: local\n")
	local.Commit("local format")

	pinned := testrepo.New(t)
	pinned.Write("AGENTS.md", "See https://github.com/vhco-pro/docs/blob/abc1234/README.md\n")
	pinned.Commit("short pin")

	complete := testrepo.Complete(t)

	doc := testrepo.FeaturePath
	p := planned.Dir
	cases := []goldenCase{
		{"knowledge", cmdline(common(complete.Dir, a), "knowledge", "--page", "guides/humanize-prose.md")},
		{"knowledge-revision-b", cmdline(common(complete.Dir, b), "knowledge")},
		{"knowledge-declared-root", cmdline(common(p, a), "knowledge")},
		{"knowledge-missing-page", cmdline(common(p, a), "knowledge", "--page", "guides/absent.md")},
		{"knowledge-invalid-pin", cmdline(common(pinned.Dir, a), "knowledge")},
		{"find", cmdline(common(p, a), "find", "--slug", "f")},
		{"lint-pass", cmdline(common(p, a), "lint", doc)},
		{"lint-fail", cmdline(common(broken.Dir, a), "lint", doc)},
		{"lint-malformed", cmdline(common(malformed.Dir, a), "lint", doc)},
		{"gate-planned", cmdline(common(p, a), "gate", "planned", doc)},
		{"gate-planned-revision-b", cmdline(common(p, b), "gate", "planned", doc)},
		{"gate-complete-not-allowed", cmdline(common(p, a), "gate", "complete", doc)},
		{"gate-complete", cmdline(common(complete.Dir, a), "gate", "complete", doc)},
		{"fresh", cmdline(common(complete.Dir, a), "fresh", doc)},
		{"next", cmdline(common(complete.Dir, a), "next", doc)},
		{"review-check", cmdline(common(p, a), "review", "check", doc, "--review", "R-1", "--returned", returned)},
		{"review-check-differs", cmdline(common(p, a), "review", "check", doc, "--review", "R-1", "--returned", differs)},
		{"usage", []string{"lint", doc}},
	}
	for _, cmd := range [][]string{{"find", "--slug", "f"}, {"lint", doc}, {"gate", "planned", doc}, {"fresh", doc}, {"next", doc}, {"review", "check", doc, "--review", "R-1", "--returned", returned}} {
		cases = append(cases, goldenCase{"local-format-" + cmd[0], cmdline(common(local.Dir, a), cmd...)})
	}
	home := t.TempDir()
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) { checkGolden(t, home, "", c) })
	}
}

func TestGoldenSettingsRead(t *testing.T) {
	const canary = "SECRETCANARY"
	tests := []struct {
		name  string
		stdin string
	}{
		{"settings-read", "# limits\nz: yes\nlimit: -0\nlabels: []\nmap: {}\nowner:\nsince: 2026-11-02\nnested:\n  b: true\n  a: [1, two]\n"},
		{"settings-read-refused", "a: 1\n" + canary + ": 1\n" + canary + ": 2\n"},
		{"settings-read-unknown-anchor", "a: *" + canary + "\n"},
	}
	home := t.TempDir()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := goldenCase{tt.name, []string{"settings", "read", "--stdin"}}
			checkGolden(t, home, tt.stdin, c)
			if out := runBinaryStdin(t, home, strings.NewReader(tt.stdin), c.args...); bytes.Contains(out.stdout, []byte(canary)) {
				t.Fatalf("the report holds text from the file: %s", out.stdout)
			}
		})
	}
}

// settingsReport is the part of a settings read report the tests below check.
// Data and Knowledge stay raw so a test can tell null from a missing key.
type settingsReport struct {
	Result    report.Result    `json:"result"`
	Knowledge json.RawMessage  `json:"knowledge"`
	Data      json.RawMessage  `json:"data"`
	Findings  []report.Finding `json:"findings"`
}

func readSettings(t *testing.T, stdin io.Reader, args ...string) (settingsReport, int) {
	t.Helper()
	out := runBinaryStdin(t, t.TempDir(), stdin, append([]string{"settings", "read", "--stdin"}, args...)...)
	var rep settingsReport
	if err := json.Unmarshal(out.stdout, &rep); err != nil {
		t.Fatalf("output is not one JSON object: %v: %s", err, out.stdout)
	}
	if string(rep.Knowledge) != "null" {
		t.Fatalf("knowledge = %s, want null", rep.Knowledge)
	}
	for _, f := range rep.Findings {
		if f.Path != "" {
			t.Fatalf("finding path = %q, want it empty", f.Path)
		}
	}
	return rep, out.exit
}

func TestSettingsReadRefusal(t *testing.T) {
	rep, exit := readSettings(t, strings.NewReader("a: 1\nb: 2\na: 3\n"))
	if exit != 3 || rep.Result != report.Malformed {
		t.Fatalf("exit %d, result %q, want 3 and malformed", exit, rep.Result)
	}
	if string(rep.Data) != "null" {
		t.Fatalf("data = %s, want null", rep.Data)
	}
	if len(rep.Findings) != 1 || rep.Findings[0].Code != report.CodeSettingsInvalid || rep.Findings[0].Line != 3 {
		t.Fatalf("findings = %+v, want one settings-invalid on line 3", rep.Findings)
	}
}

func TestSettingsReadFailedRead(t *testing.T) {
	dir, err := os.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = dir.Close() })
	rep, exit := readSettings(t, dir)
	if exit != 4 || rep.Result != report.Error {
		t.Fatalf("exit %d, result %q, want 4 and error", exit, rep.Result)
	}
	if string(rep.Data) != "null" || len(rep.Findings) != 1 || rep.Findings[0].Code != report.CodeError {
		t.Fatalf("data = %s, findings = %+v, want null and one error finding", rep.Data, rep.Findings)
	}
}

// TestSettingsReadIgnoresPin holds the exemption: the command needs no
// conventions, so a pin, valid or not, changes nothing.
func TestSettingsReadIgnoresPin(t *testing.T) {
	for _, args := range [][]string{nil, {"--plugin-pin", "not-a-sha"}, {"--plugin-pin", strings.Repeat("0", 40)}} {
		rep, exit := readSettings(t, strings.NewReader("a: 1\n"), args...)
		if exit != 0 || rep.Result != report.Answered || string(rep.Data) != `{"value":{"a":1}}` {
			t.Fatalf("%v: exit %d, result %q, data %s", args, exit, rep.Result, rep.Data)
		}
	}
}

// snapshot hashes every file below dir, including .git.
func snapshot(t *testing.T, dir string) map[string]string {
	t.Helper()
	out := map[string]string{}
	err := filepath.WalkDir(dir, func(path string, e fs.DirEntry, err error) error {
		if err != nil || e.IsDir() {
			return err
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		info, err := e.Info()
		if err != nil {
			return err
		}
		out[path] = fmt.Sprintf("%x %v", sha256.Sum256(b), info.Mode())
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestBoundary(t *testing.T) {
	src, a, _ := docs(t)
	f := testrepo.Complete(t)
	f.Write("src/untracked.go", "package a\n")
	home := t.TempDir()
	returned := filepath.Join(t.TempDir(), "returned.txt")
	if err := os.WriteFile(returned, []byte("NO FINDINGS\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	beforeRepo, beforeHome := snapshot(t, f.Dir), snapshot(t, home)
	doc := testrepo.FeaturePath
	common := []string{"--repo", f.Dir, "--plugin-pin", a, "--docs-source", src}
	for _, args := range [][]string{
		{"knowledge", "--page", "guides/humanize-prose.md"},
		{"find", "--slug", "f"},
		{"lint", doc},
		{"gate", "complete", doc},
		{"fresh", doc},
		{"next", doc},
		{"review", "check", doc, "--review", "R-2", "--returned", returned},
	} {
		if out := runBinary(t, home, cmdline(common, args...)...); out.exit == 2 {
			t.Fatalf("%v: usage error, so the boundary run tests nothing: %s", args, out.stdout)
		}
	}
	runBinary(t, home, "knowledge", "--repo", f.Dir, "--plugin-pin", a, "--offline")
	if after := snapshot(t, f.Dir); !mapsEqual(beforeRepo, after) {
		t.Fatalf("running every command changed the repository:\n%v", diff(beforeRepo, after))
	}
	if after := snapshot(t, home); !mapsEqual(beforeHome, after) {
		t.Fatalf("running with --docs-source and a cold --offline cache wrote below HOME:\n%v", diff(beforeHome, after))
	}
}

func mapsEqual(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

func diff(a, b map[string]string) []string {
	var out []string
	for k, v := range a {
		if b[k] != v {
			out = append(out, "changed or removed: "+k)
		}
	}
	for k := range b {
		if _, ok := a[k]; !ok {
			out = append(out, "added: "+k)
		}
	}
	slices.Sort(out)
	return out
}
