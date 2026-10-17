package doc

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/michielvha/vh-adlc/internal/gitcmd"
	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/rules"
)

func (d *Doc) finding(line int, code, format string, a ...any) report.Finding {
	return report.Finding{Code: code, Message: fmt.Sprintf(format, a...), Path: d.Path, Line: line}
}

// Lint checks the rules a well-shaped document can still break. With a Git
// directory it also checks that no ID was removed and later reused.
func Lint(ctx context.Context, g gitcmd.Git, d *Doc, r *rules.Rules) []report.Finding {
	var out []report.Finding
	add := func(f report.Finding) { out = append(out, f) }

	criteria := map[string]bool{}
	for _, c := range d.Criteria {
		if !r.Re.CriterionID.MatchString(c.ID) {
			add(d.finding(c.Line, report.CodeIDMalformed, "criterion ID %q does not match %s", c.ID, r.IDs.Criterion))
		}
		if criteria[c.ID] {
			add(d.finding(c.Line, report.CodeIDDuplicate, "criterion %s appears more than once", c.ID))
		}
		criteria[c.ID] = true
	}
	tasks := map[string]bool{}
	for _, t := range d.Tasks {
		if !r.Re.TaskID.MatchString(t.ID) {
			add(d.finding(t.Line, report.CodeIDMalformed, "task ID %q does not match %s", t.ID, r.IDs.Task))
		}
		if tasks[t.ID] {
			add(d.finding(t.Line, report.CodeIDDuplicate, "task %s appears more than once", t.ID))
		}
		tasks[t.ID] = true
		for _, ref := range t.Refs {
			if !criteria[ref] {
				add(d.finding(t.Line, report.CodeTaskCriterionUnknown, "task %s names %s, which is not a criterion", t.ID, ref))
			}
		}
	}

	if d.TestPlan != nil {
		for _, row := range d.TestPlan.Rows {
			if len(row.Cells) == 0 || !r.Re.CriterionCell.MatchString(row.Cells[0]) {
				add(d.finding(row.Line, report.CodeTestPlanCell, "Test Plan cell %q does not match %s", first(row.Cells), r.TestPlan.CriterionCell))
			}
		}
		planned := d.TestPlanIDs()
		for _, c := range d.Criteria {
			if !slices.Contains(planned, c.ID) {
				add(d.finding(c.Line, report.CodeTestPlanRowMissing, "criterion %s has no Test Plan row", c.ID))
			}
		}
	}

	out = append(out, d.lintReviews(r)...)

	for _, c := range d.Covers {
		if strings.Contains(c, "**") {
			add(d.finding(1, report.CodeCoversPatternUnsupport, "covers entry %q uses **, which is not supported", c))
		}
	}
	if g.Dir != "" && d.Path != "" {
		out = append(out, d.recycled(ctx, g, r)...)
	}
	return out
}

func first(cs []string) string {
	if len(cs) == 0 {
		return ""
	}
	return cs[0]
}

func (d *Doc) lintReviews(r *rules.Rules) []report.Finding {
	var out []report.Finding
	add := func(f report.Finding) { out = append(out, f) }
	seen := map[string]bool{}
	for _, rv := range d.Reviews {
		var bad []string
		if !r.Re.ReviewID.MatchString(rv.ID) {
			bad = append(bad, fmt.Sprintf("review %q does not match %s", rv.ID, r.IDs.Review))
		}
		if !slices.Contains(r.ReviewKinds, rv.Kind) {
			bad = append(bad, fmt.Sprintf("kind %q is not one of %s", rv.Kind, strings.Join(r.ReviewKinds, ", ")))
		}
		if !r.Re.ReviewCommit.MatchString(rv.RawCommit) {
			bad = append(bad, fmt.Sprintf("commit %q does not match %s", rv.RawCommit, r.ReviewCommit))
		}
		if !slices.Contains(r.Isolation, rv.Isolation) {
			bad = append(bad, fmt.Sprintf("isolation %q is not one of %s", rv.Isolation, strings.Join(r.Isolation, ", ")))
		}
		if bad != nil {
			add(d.finding(rv.Line, report.CodeReviewRowMalformed, "Review Log row: %s", strings.Join(bad, "; ")))
		}
		if rv.Acceptance {
			continue
		}
		if seen[rv.ID] {
			add(d.finding(rv.Line, report.CodeIDDuplicate, "review %s has more than one Review Log row", rv.ID))
		}
		seen[rv.ID] = true
	}
	subs := map[string]bool{}
	for _, s := range d.Subsections {
		if subs[s.ID] {
			add(d.finding(s.Line, report.CodeIDDuplicate, "review %s has more than one subsection", s.ID))
		}
		subs[s.ID] = true
	}
	for _, rv := range d.Reviews {
		if rv.Acceptance && !seen[rv.ID] {
			add(d.finding(rv.Line, report.CodeAcceptanceReviewUnknown, "the acceptance row names %s, which has no review row", rv.ID))
		}
	}

	for _, rv := range d.decisive() {
		s := d.SubsectionFor(rv.ID)
		if s == nil {
			add(d.finding(rv.Line, report.CodeReviewSubsectionMissing, "review %s has no ### %s subsection with its records", rv.ID, rv.ID))
			continue
		}
		switch rv.Kind {
		case rules.KindSpec:
			recs := r.SpecRecords(s.Lines)
			switch {
			case recs.Mixed:
				add(d.finding(s.Line, report.CodeReviewRecordsMixed, "review %s holds finding records and NO FINDINGS together", rv.ID))
			case !recs.WellFormed:
				add(d.finding(s.Line, report.CodeReviewRecordsMalformed, "review %s does not hold complete finding records or exactly NO FINDINGS", rv.ID))
			}
		case rules.KindImplementation:
			if _, ok := r.ImplRecords(s.Lines); !ok {
				add(d.finding(s.Line, report.CodeReviewRecordsMalformed, "review %s does not hold complete criterion records", rv.ID))
			}
		}
	}
	return out
}

// decisive returns the reviews whose records still decide something: the
// latest spec review, the latest implementation review and the review the
// latest acceptance names.
func (d *Doc) decisive() []*Review {
	var out []*Review
	push := func(r *Review) {
		if r != nil && !slices.ContainsFunc(out, func(o *Review) bool { return o.ID == r.ID }) {
			out = append(out, r)
		}
	}
	push(d.LatestReview(rules.KindSpec))
	push(d.LatestReview(rules.KindImplementation))
	if a := d.LatestAcceptance(); a != nil {
		push(d.ReviewByID(a.ID))
	}
	return out
}

// ids returns the criterion, task and review IDs the document defines.
func (d *Doc) ids() map[string]int {
	out := map[string]int{}
	for _, c := range d.Criteria {
		out[c.ID] = c.Line
	}
	for _, t := range d.Tasks {
		out[t.ID] = t.Line
	}
	for _, r := range d.Reviews {
		if !r.Acceptance {
			out[r.ID] = r.Line
		}
	}
	return out
}

// recycled reports IDs that were present in one committed version of the
// document, absent from a later one, and present again now.
func (d *Doc) recycled(ctx context.Context, g gitcmd.Git, r *rules.Rules) []report.Finding {
	out, err := g.Run(ctx, "log", "--format=%H", "--no-follow", "--no-show-signature", "--", d.Path)
	if err != nil {
		return nil
	}
	shas := strings.Fields(string(out))
	slices.Reverse(shas)
	seen := map[string]bool{}
	gap := map[string]bool{}
	for _, sha := range shas {
		raw, err := g.Run(ctx, "show", sha+":"+d.Path)
		if err != nil {
			continue
		}
		version := Parse(d.Path, raw, r).ids()
		for id := range seen {
			if _, ok := version[id]; !ok {
				gap[id] = true
			}
		}
		for id := range version {
			seen[id] = true
		}
	}
	current := d.ids()
	var ids []string
	for id := range current {
		if gap[id] {
			ids = append(ids, id)
		}
	}
	slices.Sort(ids)
	var findings []report.Finding
	for _, id := range ids {
		findings = append(findings, d.finding(current[id], report.CodeIDRecycled, "%s was removed in an earlier commit and is used again; IDs are never reused", id))
	}
	return findings
}
