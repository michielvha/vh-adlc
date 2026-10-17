package doc

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"slices"

	"github.com/michielvha/vh-adlc/internal/knowledge"
	"github.com/michielvha/vh-adlc/internal/report"
)

// Env is what a document command works on: the resolved knowledge and the
// parsed document.
type Env struct {
	K   *knowledge.Resolved
	Doc *Doc
}

// Open resolves knowledge and reads the document. When it cannot, it returns
// the report the command prints instead.
func Open(ctx context.Context, command string, ko knowledge.Options, docPath string) (*Env, *report.Report) {
	k, result, findings := knowledge.Resolve(ctx, ko)
	if k == nil {
		return nil, report.New(command, result, findings...)
	}
	fail := func(result report.Result, f report.Finding) (*Env, *report.Report) {
		rep := report.New(command, result, f)
		rep.Knowledge = &k.Knowledge
		return nil, rep
	}
	if k.LocalFormat {
		return fail(report.LocalFormat, report.Finding{Code: report.CodeLocalFormat, Message: "the repository declares its own feature-document format; the binary does not decide it", Path: "AGENTS.md"})
	}
	clean := path.Clean(filepath.ToSlash(docPath))
	if path.IsAbs(clean) || clean == ".." || len(clean) > 2 && clean[:3] == "../" {
		return fail(report.Usage, report.Finding{Code: report.CodeUsage, Message: fmt.Sprintf("document path %q must be relative to the repository root", docPath)})
	}
	raw, err := os.ReadFile(filepath.Join(k.Root, filepath.FromSlash(clean)))
	if err != nil {
		reason := "cannot be read"
		if errors.Is(err, fs.ErrNotExist) {
			reason = "does not exist"
		}
		return fail(report.Error, report.Finding{Code: report.CodeError, Message: fmt.Sprintf("document %s %s", clean, reason), Path: clean})
	}
	return &Env{K: k, Doc: Parse(clean, raw, k.Rules)}, nil
}

// Report returns a report for the command carrying the environment's
// knowledge.
func (e *Env) Report(command string, result report.Result, findings ...report.Finding) *report.Report {
	rep := report.New(command, result, findings...)
	rep.Knowledge = &e.K.Knowledge
	return rep
}

type documentData struct {
	Document string `json:"document"`
}

// LintCommand answers vh-adlc lint.
func LintCommand(ctx context.Context, ko knowledge.Options, docPath string) *report.Report {
	env, rep := Open(ctx, "lint", ko, docPath)
	if rep != nil {
		return rep
	}
	d := env.Doc
	lint, err := Lint(ctx, env.K.Git, d, env.K.Rules)
	if err != nil {
		return env.Report("lint", report.Error, report.Finding{Code: report.CodeError, Message: err.Error(), Path: d.Path})
	}
	findings := slices.Concat(d.Shape, lint)
	result := report.Pass
	switch {
	case len(d.Shape) > 0:
		result = report.Malformed
	case len(findings) > 0:
		result = report.Fail
	}
	rep = env.Report("lint", result, findings...)
	rep.Data = documentData{Document: d.Path}
	return rep
}

type findData struct {
	Documents []string `json:"documents"`
}

var issueNumber = regexp.MustCompile(`^[0-9]+$`)

// FindCommand answers vh-adlc find.
func FindCommand(ctx context.Context, ko knowledge.Options, issue, slug string) *report.Report {
	if (issue == "") == (slug == "") {
		return report.New("find", report.Usage, report.Finding{Code: report.CodeUsage, Message: "find takes exactly one of --issue and --slug"})
	}
	if issue != "" && !issueNumber.MatchString(issue) {
		return report.New("find", report.Usage, report.Finding{Code: report.CodeUsage, Message: fmt.Sprintf("--issue %q must be a number", issue)})
	}
	k, result, findings := knowledge.Resolve(ctx, ko)
	if k == nil {
		return report.New("find", result, findings...)
	}
	if k.LocalFormat {
		rep := report.New("find", report.LocalFormat, report.Finding{Code: report.CodeLocalFormat, Message: "the repository declares its own feature-document format; the binary does not read its documents", Path: "AGENTS.md"})
		rep.Knowledge = &k.Knowledge
		return rep
	}
	docs, err := Find(k.Root, k.FeatureRoot, issue, slug)
	if err != nil {
		rep := report.New("find", report.Error, report.Finding{Code: report.CodeError, Message: fmt.Sprintf("searching %s: %v", k.FeatureRoot, err)})
		rep.Knowledge = &k.Knowledge
		return rep
	}
	rep := report.New("find", report.Answered)
	rep.Knowledge = &k.Knowledge
	rep.Data = findData{Documents: docs}
	return rep
}
