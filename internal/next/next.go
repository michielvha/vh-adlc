// Package next names the one next operation for a feature document, from the
// rules block's ordered next rules.
package next

import (
	"context"
	"fmt"
	"slices"

	"github.com/michielvha/vh-adlc/internal/doc"
	"github.com/michielvha/vh-adlc/internal/fresh"
	"github.com/michielvha/vh-adlc/internal/gate"
	"github.com/michielvha/vh-adlc/internal/gitcmd"
	"github.com/michielvha/vh-adlc/internal/knowledge"
	"github.com/michielvha/vh-adlc/internal/report"
)

// Data is the answer of vh-adlc next.
type Data struct {
	Action string `json:"action"`
	Rule   int    `json:"rule"`
	Reason string `json:"reason"`
}

// Evaluate returns the first next rule that matches the document. Rule is its
// 1-based position in the block's next list.
func Evaluate(ctx context.Context, g gitcmd.Git, d *doc.Doc) (*Data, error) {
	e := gate.NewEvaluator(ctx, g, d)
	for i, rule := range d.Rules().Next {
		if !slices.Contains(rule.Status, d.Status) {
			continue
		}
		cond, negated := rule.Condition()
		reason := "status " + d.Status
		if cond != "" {
			holds, err := e.Holds(cond)
			if err != nil {
				return nil, err
			}
			if holds == negated {
				continue
			}
			if negated {
				reason = fmt.Sprintf("status %s and %s does not hold: %s", d.Status, cond, e.Reason(cond))
			} else {
				reason = fmt.Sprintf("status %s and %s holds", d.Status, cond)
			}
		}
		return &Data{Action: rule.Do, Rule: i + 1, Reason: reason}, nil
	}
	return nil, fmt.Errorf("no next rule matches status %q", d.Status)
}

// Command answers vh-adlc next.
func Command(ctx context.Context, ko knowledge.Options, docPath string) *report.Report {
	env, rep := doc.Open(ctx, "next", ko, docPath)
	if rep != nil {
		return rep
	}
	if len(env.Doc.Shape) > 0 {
		return env.Report("next", report.Malformed, env.Doc.Shape...)
	}
	data, err := Evaluate(ctx, env.K.Git, env.Doc)
	if err != nil {
		return env.Report("next", report.Error, fresh.ErrorFinding(err))
	}
	rep = env.Report("next", report.Answered)
	rep.Data = data
	return rep
}
