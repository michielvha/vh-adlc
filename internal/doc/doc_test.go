package doc

import (
	"bytes"
	"slices"
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/internal/gitcmd"
	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/rules"
	"github.com/michielvha/vh-adlc/internal/testrepo"
)

func standardRules(t *testing.T) *rules.Rules {
	t.Helper()
	r, err := rules.Parse([]byte(testrepo.Standard()))
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func conforming() string { return testrepo.File("docs/conforming.md") }

func edit(t *testing.T, s, from, to string) string {
	t.Helper()
	if !strings.Contains(s, from) {
		t.Fatalf("document has no %q", from)
	}
	return strings.Replace(s, from, to, 1)
}

const logHeader = "| Date | Review | Kind | Commit | Model | Isolation | Outcome |\n| --- | --- | --- | --- | --- | --- | --- |\n"

// withReviews appends Review Log rows and subsections to the document.
func withReviews(t *testing.T, s, rows, subsections string) string {
	t.Helper()
	return edit(t, s, logHeader, logHeader+rows) + "\n" + subsections
}

func codes(fs []report.Finding) []string {
	var out []string
	for _, f := range fs {
		out = append(out, f.Code)
	}
	slices.Sort(out)
	return slices.Compact(out)
}

func TestParseConforming(t *testing.T) {
	r := standardRules(t)
	d := Parse("docs/f.md", []byte(conforming()), r)
	if len(d.Shape) != 0 {
		t.Fatalf("shape findings: %+v", d.Shape)
	}
	if d.Status != "draft" || !slices.Equal(d.Covers, []string{"src/", "config.yml"}) {
		t.Fatalf("status %q, covers %q", d.Status, d.Covers)
	}
	if len(d.Criteria) != 2 || d.Criteria[0].Text != "The first end state, wrapped onto a second line." || d.Criteria[0].Ticked {
		t.Fatalf("criteria = %+v", d.Criteria)
	}
	if len(d.Tasks) != 2 || !slices.Equal(d.Tasks[1].Refs, []string{"AC-01", "AC-02"}) {
		t.Fatalf("tasks = %+v", d.Tasks)
	}
	if len(d.OpenQuestions) != 0 {
		t.Fatalf("open questions found inside a fence: %v", d.OpenQuestions)
	}
	if got := d.TestPlanIDs(); !slices.Equal(got, []string{"AC-01", "AC-02"}) {
		t.Fatalf("test plan IDs = %v", got)
	}
	if got := Lint(t.Context(), gitcmd.Git{}, d, r); len(got) != 0 {
		t.Fatalf("lint findings on a conforming document: %+v", got)
	}
}

func TestShape(t *testing.T) {
	r := standardRules(t)
	c := conforming()
	tests := []struct {
		name string
		doc  string
		code string
	}{
		{"no frontmatter", strings.SplitN(c, "---\n", 3)[2], report.CodeFrontmatterMissing},
		{"missing field", edit(t, c, "goal: \"A fixture feature with an observable outcome.\"\n", ""), report.CodeFrontmatterFieldMissing},
		{"in-progress without branch", edit(t, c, "status: draft", "status: in-progress"), report.CodeFrontmatterFieldMissing},
		{"unknown status", edit(t, c, "status: draft", "status: dreaming"), report.CodeStatusUnknown},
		{"missing section", edit(t, c, "## Open Questions\n\nNone.\n", ""), report.CodeSectionMissing},
		{"section order", edit(t, edit(t, c, "## Context\n\nWhy the fixture exists.\n\n", ""), "## Design\n", "## Design\n\n## Context\n\nWhy.\n"), report.CodeSectionOrder},
		{"no test plan header", edit(t, c, "| Criterion | Proof |", "| Criterion | Evidence |"), report.CodeTestPlanHeader},
		{"no review log header", edit(t, c, "| Date | Review |", "| When | Review |"), report.CodeReviewLogHeader},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := Parse("docs/f.md", []byte(tt.doc), r)
			if !slices.Contains(codes(d.Shape), tt.code) {
				t.Fatalf("shape = %+v, want %s", d.Shape, tt.code)
			}
		})
	}
}

func TestLintCodes(t *testing.T) {
	r := standardRules(t)
	c := conforming()
	specRow := "| 2026-01-01 | R-1 | spec | `0123abc` | fable | procedural | Review. |\n"
	accept := "| 2026-01-01 | R-1 | spec | `0123abc` | n/a | n/a | accepted by owner |\n"
	clean := "### R-1\n\nNO FINDINGS\n"
	tests := []struct {
		name string
		doc  string
		code string
	}{
		{"duplicate criterion", edit(t, c, "- [ ] AC-02: The second end state.", "- [ ] AC-02: The second end state.\n- [ ] AC-02: Again."), report.CodeIDDuplicate},
		{"duplicate task", edit(t, c, "- [ ] T2 ", "- [ ] T1 "), report.CodeIDDuplicate},
		{"test plan row missing", edit(t, c, "| AC-02 | A written manual procedure |\n", ""), report.CodeTestPlanRowMissing},
		{"test plan cell", edit(t, c, "| AC-02 | A written", "| AC-2 and more | A written"), report.CodeTestPlanCell},
		{"task names unknown criterion", edit(t, c, "(AC-01)\n", "(AC-09)\n"), report.CodeTaskCriterionUnknown},
		{"review row malformed", withReviews(t, c, "| 2026-01-01 | R-1 | design | `0123abc` | fable | procedural | Review. |\n", clean), report.CodeReviewRowMalformed},
		{"acceptance of unknown review", withReviews(t, c, specRow+strings.Replace(accept, "R-1", "R-2", 1), clean), report.CodeAcceptanceReviewUnknown},
		{"subsection missing", withReviews(t, c, specRow, ""), report.CodeReviewSubsectionMissing},
		{"records malformed", withReviews(t, c, specRow, "### R-1\n\nLooks fine to me.\n"), report.CodeReviewRecordsMalformed},
		{"records mixed", withReviews(t, c, specRow, "### R-1\n\nFINDING: F-01\nSEVERITY: nit\n\nNO FINDINGS\n"), report.CodeReviewRecordsMixed},
		{"duplicate review", withReviews(t, c, specRow+specRow, clean), report.CodeIDDuplicate},
		{"implementation records malformed", withReviews(t, c, "| 2026-01-02 | R-2 | implementation | `0123abc` | fable | procedural | Review. |\n", "### R-2\n\nCRITERION: AC-01 The first end state, wrapped onto a second line.\nEVIDENCE: no verdict\n"), report.CodeReviewRecordsMalformed},
		{"covers pattern", edit(t, c, "  - config.yml\n", "  - src/**/x.go\n"), report.CodeCoversPatternUnsupport},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := Parse("docs/f.md", []byte(tt.doc), r)
			if len(d.Shape) != 0 {
				t.Fatalf("unexpected shape findings %+v", d.Shape)
			}
			got := Lint(t.Context(), gitcmd.Git{}, d, r)
			if !slices.Contains(codes(got), tt.code) {
				t.Fatalf("lint = %+v, want %s", got, tt.code)
			}
		})
	}
}

func TestIDMalformed(t *testing.T) {
	loose := strings.Replace(testrepo.Standard(), `criterion_line: '^- \[( |x)\] (AC-\d{2,}):'`, `criterion_line: '^- \[( |x)\] (AC-\d+):'`, 1)
	r, err := rules.Parse([]byte(loose))
	if err != nil {
		t.Fatal(err)
	}
	d := Parse("docs/f.md", []byte(edit(t, conforming(), "- [ ] AC-02:", "- [ ] AC-2:")), r)
	if got := Lint(t.Context(), gitcmd.Git{}, d, r); !slices.Contains(codes(got), report.CodeIDMalformed) {
		t.Fatalf("lint = %+v", got)
	}
}

func TestIDRecycled(t *testing.T) {
	r := standardRules(t)
	repo := testrepo.New(t)
	c := conforming()
	repo.Write("docs/f.md", c)
	repo.Commit("add")
	without := edit(t, edit(t, edit(t, c, "- [ ] AC-02: The second end state.\n", ""), "| AC-02 | A written manual procedure |\n", ""), "(AC-01,\n      AC-02)", "(AC-01)")
	repo.Write("docs/f.md", without)
	repo.Commit("drop AC-02")
	repo.Write("docs/f.md", c)
	repo.Commit("reuse AC-02")
	repo.Git("config", "log.follow", "true")
	repo.Git("config", "log.showSignature", "true")
	g := gitcmd.Git{Dir: repo.Dir, Env: testrepo.Env(repo.Home)}
	d := Parse("docs/f.md", []byte(c), r)
	got := Lint(t.Context(), g, d, r)
	if !slices.Contains(codes(got), report.CodeIDRecycled) {
		t.Fatalf("lint = %+v, want id-recycled", got)
	}
	for _, f := range got {
		if f.Code == report.CodeIDRecycled && !strings.Contains(f.Message, "AC-02") {
			t.Fatalf("recycled finding names the wrong ID: %+v", f)
		}
	}
}

func TestBaseline(t *testing.T) {
	r := standardRules(t)
	c := conforming()
	base := Baseline([]byte(c), r)
	same := map[string]string{
		"tick":             edit(t, c, "- [ ] AC-02:", "- [x] AC-02:"),
		"evidence":         edit(t, c, "- [ ] AC-02: The second end state.\n", "- [x] AC-02: The second end state.\n      Evidence: ran it, abc1234, passed, none\n"),
		"wrapped evidence": edit(t, c, "- [ ] AC-02: The second end state.\n", "- [x] AC-02: The second end state.\n      Evidence: ran it, abc1234,\n      passed after a long line, none\n"),
		"residual":         edit(t, c, "- [ ] AC-02: The second end state.\n", "- [ ] AC-02: The second end state.\n      Residual: #12\n"),
		"tasks":            edit(t, c, "- [ ] T1 ", "- [x] T1 "),
		"status":           edit(t, c, "status: draft", "status: planned"),
		"review log":       withReviews(t, c, "| 2026-01-01 | R-1 | spec | `0123abc` | fable | procedural | Review. |\n", "### R-1\n\nNO FINDINGS\n"),
		"context":          edit(t, c, "Why the fixture exists.", "Why the fixture exists, said differently."),
	}
	for name, s := range same {
		if !bytes.Equal(Baseline([]byte(s), r), base) {
			t.Errorf("%s changed the baseline", name)
		}
	}
	differ := map[string]string{
		"criterion text":   edit(t, c, "The second end state.", "The second, revised end state."),
		"criterion order":  edit(t, edit(t, c, "- [ ] AC-02: The second end state.\n", ""), "- [ ] AC-01:", "- [ ] AC-02: The second end state.\n- [ ] AC-01:"),
		"test plan":        edit(t, c, "A written manual procedure", "A scenario"),
		"covers":           edit(t, c, "  - config.yml\n", "  - other.yml\n"),
		"design":           edit(t, c, "The design.", "Another design."),
		"wrapped criteria": edit(t, c, "      wrapped onto a second line.", "      wrapped onto another line."),
	}
	for name, s := range differ {
		if bytes.Equal(Baseline([]byte(s), r), base) {
			t.Errorf("%s did not change the baseline", name)
		}
	}
}

func TestMatchCovers(t *testing.T) {
	covers := []string{"src/", "config.yml", "docs/*.md"}
	for p, want := range map[string]bool{
		"src/a.go":       true,
		"src/deep/b.go":  true,
		"srcx/a.go":      false,
		"config.yml":     true,
		"config.yml.bak": false,
		"docs/a.md":      true,
		"docs/x/a.md":    false,
		"README.md":      false,
	} {
		if got := MatchCovers(covers, p); got != want {
			t.Errorf("MatchCovers(%q) = %v, want %v", p, got, want)
		}
	}
}

func TestFind(t *testing.T) {
	repo := testrepo.New(t)
	c := conforming()
	repo.Write("docs/specs/alpha.md", c)
	repo.Write("docs/specs/beta.spec.md", edit(t, c, "issues/7", "issues/8"))
	repo.Write("docs/specs/gamma.md", edit(t, c, "issue: https://github.com/example/repo/issues/7", "issue: \"#9\""))
	repo.Write("docs/specs/notes.md", "No frontmatter here.\n")
	repo.Write("docs/elsewhere/delta.md", c)
	tests := []struct {
		name, issue, slug string
		want              []string
	}{
		{"issue URL", "7", "", []string{"docs/specs/alpha.md"}},
		{"issue hash", "9", "", []string{"docs/specs/gamma.md"}},
		{"slug .md", "", "alpha", []string{"docs/specs/alpha.md"}},
		{"slug .spec.md", "", "beta", []string{"docs/specs/beta.spec.md"}},
		{"no match", "", "omega", []string{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Find(repo.Dir, "docs/specs/", tt.issue, tt.slug)
			if err != nil {
				t.Fatal(err)
			}
			if !slices.Equal(got, tt.want) {
				t.Fatalf("Find = %q, want %q", got, tt.want)
			}
		})
	}
	if got, err := Find(repo.Dir, "docs/absent/", "7", ""); err != nil || len(got) != 0 {
		t.Fatalf("absent root: %q, %v", got, err)
	}
}
