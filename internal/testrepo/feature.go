package testrepo

import (
	"strings"
	"testing"
)

// FeaturePath is where Feature fixtures keep their document.
const FeaturePath = "docs/f.md"

// Criterion texts of the conforming fixture, as folded.
const (
	AC1 = "The first end state, wrapped onto a second line."
	AC2 = "The second end state."
)

const logHeader = "| Date | Review | Kind | Commit | Model | Isolation | Outcome |\n| --- | --- | --- | --- | --- | --- | --- |\n"

// Record returns one implementation-review record.
func Record(id, text, verdict string) string {
	return "CRITERION: " + id + " " + text + "\nVERDICT: " + verdict + "\nEVIDENCE: observed\n"
}

// AllMet is a complete implementation review of the conforming fixture.
var AllMet = Record("AC-01", AC1, "met") + "\n" + Record("AC-02", AC2, "met")

// Blocking is a spec review with one blocking finding.
const Blocking = "FINDING: F-01\nKIND: factual\nSEVERITY: blocking\nWHERE: Design\nEVIDENCE: x\nPROPOSAL: y"

// Feature is a repository holding one feature document as text.
type Feature struct {
	*Repo
	Text string
	// X is the short SHA of the commit the spec review and acceptance name.
	X string
}

// Planned builds a draft document from text with a clean spec review R-1 and
// its acceptance at commit X, with origin pushed.
func Planned(t testing.TB, text string) *Feature {
	t.Helper()
	f := &Feature{Repo: New(t), Text: text}
	f.Write(FeaturePath, f.Text)
	f.Write("src/a.go", "package a\n")
	f.X = f.Commit("fixture")[:7]
	f.Row("R-1", "spec", f.X, "fable", "procedural", "Review.", "NO FINDINGS")
	f.Row("R-1", "spec", f.X, "n/a", "n/a", "accepted by owner", "")
	f.Commit("accept")
	f.AddRemote()
	return f
}

// Complete extends Planned to an in-progress document on branch feat with
// every criterion ticked with evidence and a clean implementation review R-2.
func Complete(t testing.TB) *Feature {
	t.Helper()
	return CompleteFrom(t, File("docs/conforming.md"))
}

// CompleteFrom is Complete starting from the given reviewed document text.
func CompleteFrom(t testing.TB, text string) *Feature {
	t.Helper()
	f := Planned(t, text)
	f.Git("switch", "-q", "-c", "feat")
	f.Edit("status: draft", "status: in-progress\nbranch: feat")
	f.Write("src/a.go", "package a // built\n")
	built := f.Commit("build")[:7]
	f.Edit("- [ ] AC-01: ", "- [x] AC-01: ")
	f.Edit("      wrapped onto a second line.\n", "      wrapped onto a second line.\n      Evidence: go test, abc1234, passed, none\n")
	f.Edit("- [ ] AC-02: The second end state.\n", "- [x] AC-02: The second end state.\n      Evidence: manual, abc1234, passed, none\n")
	f.Row("R-2", "implementation", built, "fable", "procedural", "Review.", AllMet)
	f.Commit("record")
	return f
}

// Edit replaces the first occurrence of from in the document and writes it.
func (f *Feature) Edit(from, to string) {
	f.t.Helper()
	if !strings.Contains(f.Text, from) {
		f.t.Fatalf("document has no %q", from)
	}
	f.Text = strings.Replace(f.Text, from, to, 1)
	f.Write(FeaturePath, f.Text)
}

// Row appends a Review Log row and, when records is not empty, its
// subsection, and writes the document.
func (f *Feature) Row(id, kind, commit, model, isolation, outcome, records string) {
	f.t.Helper()
	line := "| 2026-01-01 | " + id + " | " + kind + " | `" + commit + "` | " + model + " | " + isolation + " | " + outcome + " |\n"
	i := strings.Index(f.Text, logHeader)
	if i < 0 {
		f.t.Fatal("document has no Review Log header")
	}
	i += len(logHeader)
	for strings.HasPrefix(f.Text[i:], "|") {
		i += strings.Index(f.Text[i:], "\n") + 1
	}
	f.Text = f.Text[:i] + line + f.Text[i:]
	if records != "" {
		f.Text += "\n### " + id + "\n\n" + records + "\n"
	}
	f.Write(FeaturePath, f.Text)
}

// Head returns the short SHA of HEAD.
func (f *Feature) Head() string { return f.Git("rev-parse", "--short=7", "HEAD") }
