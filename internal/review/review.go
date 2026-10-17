// Package review checks that a review's stored records are exactly the ones
// the reviewer returned.
package review

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"slices"
	"strings"

	"github.com/michielvha/vh-adlc/internal/doc"
	"github.com/michielvha/vh-adlc/internal/knowledge"
	"github.com/michielvha/vh-adlc/internal/report"
)

// Data is the answer of vh-adlc review check.
type Data struct {
	Review string `json:"review"`
	Equal  bool   `json:"equal"`
}

// Check compares the review's stored subsection with the returned records.
// Blank lines before and after are ignored on both sides; every other byte
// must match.
func Check(d *doc.Doc, id string, returned []byte) (*Data, []report.Finding, report.Result) {
	data := &Data{Review: id}
	s := d.SubsectionFor(id)
	if s == nil {
		return data, []report.Finding{{Code: report.CodeReviewNotFound, Message: fmt.Sprintf("the document has no ### %s subsection", id), Path: d.Path}}, report.Fail
	}
	want := doc.TrimBlank(strings.Split(string(returned), "\n"))
	if !slices.Equal(s.Lines, want) {
		return data, []report.Finding{{Code: report.CodeRecordsDiffer, Message: fmt.Sprintf("the records stored under ### %s differ from the returned file", id), Path: d.Path, Line: s.Line}}, report.Fail
	}
	data.Equal = true
	return data, nil, report.Pass
}

// Command answers vh-adlc review check.
func Command(ctx context.Context, ko knowledge.Options, docPath, id, returnedPath string) *report.Report {
	if id == "" || returnedPath == "" {
		return report.New("review check", report.Usage, report.Finding{Code: report.CodeUsage, Message: "review check needs --review R-<n> and --returned <file>"})
	}
	env, rep := doc.Open(ctx, "review check", ko, docPath)
	if rep != nil {
		return rep
	}
	if !env.K.Rules.Re.ReviewID.MatchString(id) {
		return env.Report("review check", report.Usage, report.Finding{Code: report.CodeUsage, Message: fmt.Sprintf("--review %q does not match %s", id, env.K.Rules.IDs.Review)})
	}
	returned, err := os.ReadFile(returnedPath)
	if err != nil {
		msg := "cannot be read"
		if errors.Is(err, fs.ErrNotExist) {
			msg = "does not exist"
		}
		return env.Report("review check", report.Usage, report.Finding{Code: report.CodeUsage, Message: "the --returned file " + msg})
	}
	data, findings, result := Check(env.Doc, id, returned)
	rep = env.Report("review check", result, findings...)
	rep.Data = data
	return rep
}
