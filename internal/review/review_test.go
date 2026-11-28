package review

import (
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/internal/doc"
	"github.com/michielvha/vh-adlc/internal/gitcmd"
	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/rules"
	"github.com/michielvha/vh-adlc/internal/testrepo"
)

func TestCheck(t *testing.T) {
	r, err := rules.Parse([]byte(testrepo.Standard()))
	if err != nil {
		t.Fatal(err)
	}
	f := testrepo.Planned(t, testrepo.File("docs/conforming.md"))
	f.Row("R-2", "spec", f.X, "fable", "procedural", "Review.", testrepo.Blocking)
	d := doc.Parse(testrepo.FeaturePath, []byte(f.Text), r)
	tests := []struct {
		name     string
		id       string
		returned string
		result   report.Result
		code     string
	}{
		{"equal", "R-2", testrepo.Blocking, report.Pass, ""},
		{"equal apart from surrounding blank lines", "R-2", "\n\n" + testrepo.Blocking + "\n\n\n", report.Pass, ""},
		{"one byte differs", "R-2", testrepo.Blocking[:len(testrepo.Blocking)-1] + "Y", report.Fail, report.CodeRecordsDiffer},
		{"inner whitespace differs", "R-2", "FINDING:  F-01" + testrepo.Blocking[len("FINDING: F-01"):], report.Fail, report.CodeRecordsDiffer},
		{"other review", "R-1", "NO FINDINGS\n", report.Pass, ""},
		{"no such review", "R-9", "NO FINDINGS\n", report.Fail, report.CodeReviewNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, findings, result := Check(d, tt.id, []byte(tt.returned))
			if result != tt.result {
				t.Fatalf("result = %q, want %q; findings %+v", result, tt.result, findings)
			}
			if tt.code == "" && (len(findings) != 0 || !data.Equal) {
				t.Fatalf("data %+v, findings %+v", data, findings)
			}
			if tt.code != "" && (len(findings) != 1 || findings[0].Code != tt.code || data.Equal) {
				t.Fatalf("data %+v, findings %+v, want %s", data, findings, tt.code)
			}
		})
	}
}

// TestTrailingSpaceRecords stores a reply whose record lines end in two
// spaces exactly as returned. Lint must accept the records and review check
// must find them equal to the reply (#134).
func TestTrailingSpaceRecords(t *testing.T) {
	r, err := rules.Parse([]byte(testrepo.Standard()))
	if err != nil {
		t.Fatal(err)
	}
	spaced := func(text string) string {
		ls := strings.Split(text, "\n")
		for i, l := range ls {
			if l != "" {
				ls[i] = l + "  "
			}
		}
		return strings.Join(ls, "\n")
	}
	tests := []struct {
		name, id, kind, records string
		feature                 func(testing.TB) *testrepo.Feature
	}{
		{"spec review", "R-2", "spec", spaced(testrepo.Blocking), func(t testing.TB) *testrepo.Feature {
			return testrepo.Planned(t, testrepo.File("docs/conforming.md"))
		}},
		{"implementation review", "R-3", "implementation", spaced(testrepo.AllMet), testrepo.Complete},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := tt.feature(t)
			f.Row(tt.id, tt.kind, f.Head(), "fable", "procedural", "Review.", tt.records)
			d := doc.Parse(testrepo.FeaturePath, []byte(f.Text), r)
			findings, err := doc.Lint(t.Context(), gitcmd.Git{Dir: f.Dir}, d, r)
			if err != nil {
				t.Fatal(err)
			}
			for _, fd := range findings {
				if fd.Code == report.CodeReviewRecordsMalformed {
					t.Fatalf("lint rejects records stored as returned: %+v", fd)
				}
			}
			reply := "\n" + tt.records + "\n"
			if data, findings, result := Check(d, tt.id, []byte(reply)); result != report.Pass || !data.Equal {
				t.Fatalf("review check = %q, %+v", result, findings)
			}
		})
	}
}
