package rules

import (
	"errors"
	"os"
	"strings"
	"testing"
)

func standard(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile("../testrepo/testdata/docs/feature-documents.md")
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestParseStandard(t *testing.T) {
	r, err := Parse([]byte(standard(t)))
	if err != nil {
		t.Fatal(err)
	}
	if r.Schema != 1 {
		t.Fatalf("schema = %d", r.Schema)
	}
	if len(r.Statuses) != 9 || r.Statuses[0] != "draft" {
		t.Fatalf("statuses = %v", r.Statuses)
	}
	if got := r.Gates["planned"]; len(got) != 6 || got[0] != "no_open_questions" {
		t.Fatalf("planned gate = %v", got)
	}
	if len(r.Next) != 17 {
		t.Fatalf("next rules = %d", len(r.Next))
	}
	if got := r.Next[0].Status; len(got) != 3 || got[2] != "in-progress" {
		t.Fatalf("next[0].status = %v", got)
	}
	if got := r.Next[6]; len(got.Status) != 1 || got.Status[0] != "draft" || got.When != "" || got.Do != "spec" {
		t.Fatalf("next[6] = %+v", got)
	}
	if r.FeatureRoot.Default != "docs/internal/plans" {
		t.Fatalf("feature root = %q", r.FeatureRoot.Default)
	}
	m := r.Re.CriterionLine.FindStringSubmatch("- [x] AC-07: text")
	if m == nil || m[1] != "x" || m[2] != "AC-07" {
		t.Fatalf("criterion_line groups = %q", m)
	}
}

func replaceBlock(t *testing.T, from, to string) string {
	t.Helper()
	s := standard(t)
	if !strings.Contains(s, from) {
		t.Fatalf("standard has no %q", from)
	}
	return strings.Replace(s, from, to, 1)
}

func TestParseErrors(t *testing.T) {
	block := "```yaml vh-adlc-rules\n"
	tests := []struct {
		name string
		page string
		code string
	}{
		{"no block", "# Page\n\nNo rules here.\n", "rules-block-missing"},
		{"wrong info string", replaceBlock(t, block, "```yaml\n"), "rules-block-missing"},
		{"two blocks", standard(t) + "\n" + block + "schema: 1\n```\n", "rules-block-ambiguous"},
		{"unknown schema", replaceBlock(t, "schema: 1\n", "schema: 2\n"), "rules-schema-unknown"},
		{"unknown gate condition", replaceBlock(t, "planned: [no_open_questions,", "planned: [no_such_condition,"), "rules-condition-unknown"},
		{"unknown next condition", replaceBlock(t, "when: not tasks_populated", "when: not tasks_counted"), "rules-condition-unknown"},
		{"pattern RE2 rejects", replaceBlock(t, `open_question: '^### Q\d+: '`, `open_question: '^### Q(?=\d+): '`), "rules-pattern-invalid"},
		{"pattern missing its group", replaceBlock(t, `record_criterion: '^CRITERION: (AC-\d{2,}) '`, `record_criterion: '^CRITERION: AC-\d{2,} '`), "rules-pattern-invalid"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Parse([]byte(tt.page))
			var e *Error
			if !errors.As(err, &e) {
				t.Fatalf("err = %v, want *Error", err)
			}
			if e.Code != tt.code {
				t.Fatalf("code = %q, want %q (%s)", e.Code, tt.code, e.Message)
			}
		})
	}
}

func lines(s string) []string { return strings.Split(strings.TrimSpace(s), "\n") }

func TestSpecRecords(t *testing.T) {
	r, err := Parse([]byte(standard(t)))
	if err != nil {
		t.Fatal(err)
	}
	finding := func(id, severity string) string {
		return "FINDING: " + id + "\nKIND: factual\nSEVERITY: " + severity + "\nWHERE: Design\nEVIDENCE: x\nPROPOSAL: y\n"
	}
	tests := []struct {
		name                         string
		text                         string
		wellFormed, clean, mixed, no bool
	}{
		{"no findings", "NO FINDINGS", true, true, false, true},
		{"nits only", finding("F-01", "nit") + "\n" + finding("F-02", "should-fix"), true, true, false, false},
		{"blocking", finding("F-01", "nit") + "\n" + finding("F-02", "blocking"), true, false, false, false},
		{"missing severity", "FINDING: F-01\nKIND: factual\nWHERE: x\n", false, false, false, false},
		{"two severities", "FINDING: F-01\nSEVERITY: nit\nSEVERITY: nit\n", false, false, false, false},
		{"mixed", finding("F-01", "nit") + "\nNO FINDINGS", false, false, true, false},
		{"empty", "", false, false, false, false},
		{"prose only", "Looks fine to me.", false, false, false, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := r.SpecRecords(lines(tt.text))
			if got.WellFormed != tt.wellFormed || got.Clean() != tt.clean || got.Mixed != tt.mixed || got.NoFindings != tt.no {
				t.Fatalf("got %+v clean=%v", got, got.Clean())
			}
		})
	}
}

func TestImplRecords(t *testing.T) {
	r, err := Parse([]byte(standard(t)))
	if err != nil {
		t.Fatal(err)
	}
	good := "CRITERION: AC-01 The first   end state.\nVERDICT: met\nEVIDENCE: test\n\nCRITERION: AC-02 Second.\nVERDICT: not verified\nEVIDENCE: none\n"
	recs, ok := r.ImplRecords(lines(good))
	if !ok || len(recs) != 2 {
		t.Fatalf("records = %+v, ok = %v", recs, ok)
	}
	if recs[0].ID != "AC-01" || recs[0].Text != "The first end state." || recs[0].Verdict != "met" {
		t.Fatalf("first record = %+v", recs[0])
	}
	if recs[1].Verdict != "not verified" {
		t.Fatalf("second record = %+v", recs[1])
	}
	for name, text := range map[string]string{
		"verdict missing": "CRITERION: AC-01 Text.\nEVIDENCE: x\n",
		"bad verdict":     "CRITERION: AC-01 Text.\nVERDICT: maybe\n",
		"no records":      "Nothing here.",
	} {
		if _, ok := r.ImplRecords(lines(text)); ok {
			t.Errorf("%s: ok = true, want false", name)
		}
	}
}

func TestFold(t *testing.T) {
	if got := Fold("  a \t b\n  c  "); got != "a b c" {
		t.Fatalf("Fold = %q", got)
	}
}
