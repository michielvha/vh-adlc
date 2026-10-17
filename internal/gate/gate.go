// Package gate evaluates the rules block's conditions on a feature document
// and decides whether a status change is allowed.
package gate

import (
	"bytes"
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/michielvha/vh-adlc/internal/doc"
	"github.com/michielvha/vh-adlc/internal/fresh"
	"github.com/michielvha/vh-adlc/internal/gitcmd"
	"github.com/michielvha/vh-adlc/internal/knowledge"
	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/rules"
)

// Evaluator answers conditions for one document. Freshness is computed once,
// when a condition first needs it.
type Evaluator struct {
	ctx      context.Context
	g        gitcmd.Git
	d        *doc.Doc
	r        *rules.Rules
	fresh    *fresh.Result
	reasons  map[string]string
	findings []report.Finding
}

// NewEvaluator returns an evaluator for the document.
func NewEvaluator(ctx context.Context, g gitcmd.Git, d *doc.Doc) *Evaluator {
	return &Evaluator{ctx: ctx, g: g, d: d, r: d.Rules(), reasons: map[string]string{}}
}

// Holds reports whether the condition holds. An error means it could not be
// decided, for example because the default branch is unknown.
func (e *Evaluator) Holds(cond string) (bool, error) {
	ok, why, err := e.eval(cond)
	if err != nil {
		return false, err
	}
	if !ok {
		e.reasons[cond] = why
	}
	return ok, nil
}

// Reason returns why a condition last failed.
func (e *Evaluator) Reason(cond string) string { return e.reasons[cond] }

// FreshFindings returns the findings freshness produced, if it was computed.
func (e *Evaluator) FreshFindings() []report.Finding { return e.findings }

func (e *Evaluator) freshness() (*fresh.Result, error) {
	if e.fresh == nil {
		res, findings, err := fresh.Compute(e.ctx, e.g, e.d)
		if err != nil {
			return nil, err
		}
		e.fresh, e.findings = res, findings
	}
	return e.fresh, nil
}

func (e *Evaluator) eval(cond string) (bool, string, error) {
	d := e.d
	switch cond {
	case "no_open_questions":
		return len(d.OpenQuestions) == 0, fmt.Sprintf("Open Questions holds %d unanswered question(s)", len(d.OpenQuestions)), nil
	case "test_plan_complete":
		planned := d.TestPlanIDs()
		var missing []string
		for _, c := range d.Criteria {
			if !slices.Contains(planned, c.ID) {
				missing = append(missing, c.ID)
			}
		}
		return d.TestPlan != nil && len(missing) == 0, "no Test Plan row for " + strings.Join(missing, ", "), nil
	case "spec_review_fresh", "impl_review_fresh":
		f, err := e.freshness()
		if err != nil {
			return false, "", err
		}
		s, kind := f.SpecReview, rules.KindSpec
		if cond == "impl_review_fresh" {
			s, kind = f.ImplementationReview, rules.KindImplementation
		}
		return !s.Stale, fmt.Sprintf("the latest %s review is stale: %s", kind, strings.Join(s.Reasons, ", ")), nil
	case "spec_review_clean":
		rv := d.LatestReview(rules.KindSpec)
		if rv == nil {
			return false, "there is no spec review", nil
		}
		return e.specClean(rv), fmt.Sprintf("spec review %s is not well formed or has a blocking finding", rv.ID), nil
	case "accepted":
		return e.accepted()
	case "tasks_populated":
		return len(d.Tasks) > 0, "no line matches task_line", nil
	case "tasks_open":
		return slices.ContainsFunc(d.Tasks, func(t doc.Task) bool { return !t.Ticked }), "every task is ticked", nil
	case "on_feature_branch_if_set":
		if d.Branch == "" {
			return true, "", nil
		}
		current, err := e.g.Output(e.ctx, "branch", "--show-current")
		if err != nil {
			return false, "", fmt.Errorf("reading the current branch: %w", err)
		}
		return current == d.Branch, fmt.Sprintf("the document belongs to branch %s, but the current branch is %q", d.Branch, current), nil
	case "all_met":
		var open []string
		for _, c := range d.Criteria {
			if !settled(c) {
				open = append(open, c.ID)
			}
		}
		return len(open) == 0, "not ticked with evidence or residualised: " + strings.Join(open, ", "), nil
	case "impl_review_clean":
		return e.implClean()
	case "feature_tree_clean":
		f, err := e.freshness()
		if err != nil {
			return false, "", err
		}
		return f.FeatureTree.Clean, "covered changes are not committed: " + strings.Join(f.FeatureTree.Paths, ", "), nil
	}
	return false, "", fmt.Errorf("unknown condition %q", cond)
}

// residualised reports whether the criterion is unticked with a residual.
func residualised(c doc.Criterion) bool { return !c.Ticked && c.Residual }

// settled reports whether the criterion is ticked with evidence or residualised.
func settled(c doc.Criterion) bool { return c.Ticked && c.Evidence || residualised(c) }

func (e *Evaluator) specClean(rv *doc.Review) bool {
	s := e.d.SubsectionFor(rv.ID)
	return s != nil && e.r.SpecRecords(s.Lines).Clean()
}

func (e *Evaluator) accepted() (bool, string, error) {
	a := e.d.LatestAcceptance()
	if a == nil {
		return false, "there is no acceptance row", nil
	}
	rv := e.d.ReviewByID(a.ID)
	if rv == nil || rv.Kind != rules.KindSpec || !e.specClean(rv) {
		return false, fmt.Sprintf("the acceptance names %s, which is not a clean spec review", a.ID), nil
	}
	raw, err := e.g.Run(e.ctx, "show", a.Commit+":"+e.d.Path)
	if err != nil || !bytes.Equal(doc.Baseline(raw, e.r), e.d.Baseline()) {
		return false, fmt.Sprintf("the normative baseline changed since the accepted commit %s", a.Commit), nil
	}
	return true, "", nil
}

func (e *Evaluator) implClean() (bool, string, error) {
	rv := e.d.LatestReview(rules.KindImplementation)
	if rv == nil {
		return false, "there is no implementation review", nil
	}
	s := e.d.SubsectionFor(rv.ID)
	if s == nil {
		return false, fmt.Sprintf("implementation review %s has no records", rv.ID), nil
	}
	recs, ok := e.r.ImplRecords(s.Lines)
	if !ok {
		return false, fmt.Sprintf("implementation review %s has incomplete records", rv.ID), nil
	}
	byID := map[string][]rules.ImplRecord{}
	for _, r := range recs {
		byID[r.ID] = append(byID[r.ID], r)
	}
	var problems []string
	for _, c := range e.d.Criteria {
		got := byID[c.ID]
		delete(byID, c.ID)
		switch {
		case len(got) != 1:
			problems = append(problems, fmt.Sprintf("%s has %d records", c.ID, len(got)))
		case got[0].Text != c.Text:
			problems = append(problems, c.ID+" record text differs from the accepted text")
		case got[0].Verdict != rules.VerdictMet && !residualised(c):
			problems = append(problems, fmt.Sprintf("%s is %s without a residual", c.ID, got[0].Verdict))
		}
	}
	extra := make([]string, 0, len(byID))
	for id := range byID {
		extra = append(extra, id)
	}
	slices.Sort(extra)
	for _, id := range extra {
		problems = append(problems, id+" is not a current criterion")
	}
	return len(problems) == 0, fmt.Sprintf("implementation review %s: %s", rv.ID, strings.Join(problems, "; ")), nil
}

// Data is the answer of vh-adlc gate.
type Data struct {
	Document   string   `json:"document"`
	Current    string   `json:"current"`
	Target     string   `json:"target"`
	Transition string   `json:"transition"`
	Failing    []string `json:"failing"`
	Line       string   `json:"line"`
}

// Evaluate decides whether the document may move to target. revision is the
// resolved docs revision, used in the status-commit line.
func Evaluate(ctx context.Context, g gitcmd.Git, d *doc.Doc, target, revision string) (*Data, []report.Finding, report.Result, error) {
	r := d.Rules()
	data := &Data{Document: d.Path, Current: d.Status, Target: target, Failing: []string{}}
	var findings []report.Finding
	failures := []string{}
	switch {
	case target == d.Status:
		data.Transition = "re-check"
	case slices.Contains(r.Transitions[d.Status], target):
		data.Transition = "allowed"
	default:
		data.Transition = "not-allowed"
		failures = append(failures, report.CodeTransitionNotAllowed)
		findings = append(findings, report.Finding{Code: report.CodeTransitionNotAllowed, Message: fmt.Sprintf("the rules do not allow %s to %s", d.Status, target), Path: d.Path})
	}
	e := NewEvaluator(ctx, g, d)
	for _, cond := range r.Gates[target] {
		ok, err := e.Holds(cond)
		if err != nil {
			return nil, nil, report.Error, err
		}
		if !ok {
			data.Failing = append(data.Failing, cond)
			findings = append(findings, report.Finding{Code: cond, Message: e.Reason(cond), Path: d.Path})
		}
	}
	failures = append(failures, data.Failing...)
	short := revision
	if len(short) > 7 {
		short = short[:7]
	}
	result := report.Pass
	data.Line = fmt.Sprintf("vh-adlc gate %s: pass (rules %d, docs %s)", target, r.Schema, short)
	if len(failures) > 0 {
		result = report.Fail
		data.Line = fmt.Sprintf("vh-adlc gate %s: fail (%s; rules %d, docs %s)", target, strings.Join(failures, ", "), r.Schema, short)
	}
	return data, findings, result, nil
}

// Command answers vh-adlc gate.
func Command(ctx context.Context, ko knowledge.Options, target, docPath string) *report.Report {
	env, rep := doc.Open(ctx, "gate", ko, docPath)
	if rep != nil {
		return rep
	}
	if !slices.Contains(env.K.Rules.Statuses, target) {
		return env.Report("gate", report.Usage, report.Finding{Code: report.CodeUsage, Message: fmt.Sprintf("%q is not one of the rules' statuses", target)})
	}
	if len(env.Doc.Shape) > 0 {
		return env.Report("gate", report.Malformed, env.Doc.Shape...)
	}
	data, findings, result, err := Evaluate(ctx, env.K.Git, env.Doc, target, env.K.Revision)
	if err != nil {
		return env.Report("gate", report.Error, fresh.ErrorFinding(err))
	}
	rep = env.Report("gate", result, findings...)
	rep.Data = data
	return rep
}
