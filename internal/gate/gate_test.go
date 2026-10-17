package gate

import (
	"slices"
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/internal/doc"
	"github.com/michielvha/vh-adlc/internal/gitcmd"
	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/rules"
	"github.com/michielvha/vh-adlc/internal/testrepo"
)

const revision = "e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a"

const (
	ac1 = testrepo.AC1
	ac2 = testrepo.AC2
)

func implRecords(lines ...string) string { return strings.Join(lines, "\n") }

var (
	rec    = testrepo.Record
	allMet = testrepo.AllMet
)

type fixture struct {
	*testrepo.Feature
	t *testing.T
	r *rules.Rules
}

func wrap(t *testing.T, f *testrepo.Feature) *fixture {
	t.Helper()
	r, err := rules.Parse([]byte(testrepo.Standard()))
	if err != nil {
		t.Fatal(err)
	}
	return &fixture{Feature: f, t: t, r: r}
}

func planned(t *testing.T) *fixture {
	t.Helper()
	return plannedFrom(t, testrepo.File("docs/conforming.md"))
}

func plannedFrom(t *testing.T, text string) *fixture { return wrap(t, testrepo.Planned(t, text)) }

func complete(t *testing.T) *fixture { return wrap(t, testrepo.Complete(t)) }

func (f *fixture) gate(target string) (*Data, []report.Finding, report.Result) {
	f.t.Helper()
	g := gitcmd.Git{Dir: f.Dir, Env: testrepo.Env(f.Home)}
	d := doc.Parse(testrepo.FeaturePath, []byte(f.Text), f.r)
	if len(d.Shape) > 0 {
		f.t.Fatalf("fixture is malformed: %+v", d.Shape)
	}
	data, findings, result, err := Evaluate(f.t.Context(), g, d, target, revision)
	if err != nil {
		f.t.Fatalf("Evaluate: %v", err)
	}
	return data, findings, result
}

func expect(t *testing.T, f *fixture, target string, failing ...string) *Data {
	t.Helper()
	data, findings, result := f.gate(target)
	wantResult := report.Pass
	if len(failing) > 0 {
		wantResult = report.Fail
	}
	if result != wantResult || !slices.Equal(data.Failing, failing) {
		t.Fatalf("gate %s: result %q, failing %q; want %q; findings %+v", target, result, data.Failing, failing, findings)
	}
	for _, c := range failing {
		if !slices.ContainsFunc(findings, func(x report.Finding) bool { return x.Code == c }) {
			t.Fatalf("no finding with code %s: %+v", c, findings)
		}
	}
	return data
}

func TestPlannedGate(t *testing.T) {
	data := expect(t, planned(t), "planned")
	if data.Transition != "allowed" || data.Current != "draft" || data.Line != "vh-adlc gate planned: pass (rules 1, docs e4d58d2)" {
		t.Fatalf("data = %+v", data)
	}
	cases := map[string]func(f *fixture){
		"no_open_questions": func(f *fixture) { f.Edit("## Open Questions\n\nNone.\n", "## Open Questions\n\n### Q1: Which?\n") },
		"spec_review_fresh": func(f *fixture) {
			f.Write("src/drift.go", "package a\n")
			f.Commit("drift")
			f.Git("push", "-q", "origin", "main")
			f.Git("reset", "-q", "--hard", "HEAD~1")
		},
		"spec_review_clean": func(f *fixture) {
			f.Row("R-2", rules.KindSpec, f.X, "fable", "procedural", "Review.", "FINDING: F-01\nKIND: factual\nSEVERITY: blocking\nWHERE: Design\nEVIDENCE: x\nPROPOSAL: y")
		},
		"accepted": func(f *fixture) {
			f.Edit("| 2026-01-01 | R-1 | spec | `"+f.X+"` | n/a | n/a | accepted by owner |\n", "")
		},
		"on_feature_branch_if_set": func(f *fixture) { f.Edit("status: draft", "status: draft\nbranch: feat") },
	}
	for cond, mutate := range cases {
		t.Run(cond, func(t *testing.T) {
			f := planned(t)
			mutate(f)
			expect(t, f, "planned", cond)
		})
	}
	t.Run("test_plan_complete", func(t *testing.T) {
		text := strings.Replace(testrepo.File("docs/conforming.md"), "| AC-02 | A written manual procedure |\n", "", 1)
		expect(t, plannedFrom(t, text), "planned", "test_plan_complete")
	})
	t.Run("several failures, in gate order", func(t *testing.T) {
		f := planned(t)
		cases["accepted"](f)
		cases["no_open_questions"](f)
		data := expect(t, f, "planned", "no_open_questions", "accepted")
		if data.Line != "vh-adlc gate planned: fail (no_open_questions, accepted; rules 1, docs e4d58d2)" {
			t.Fatalf("line = %q", data.Line)
		}
	})
	t.Run("a changed baseline breaks freshness and acceptance", func(t *testing.T) {
		f := planned(t)
		f.Edit(ac2, "The second, revised end state.")
		f.Commit("revise")
		expect(t, f, "planned", "spec_review_fresh", "accepted")
	})
}

func TestInProgressGate(t *testing.T) {
	f := planned(t)
	f.Edit("status: draft", "status: planned")
	expect(t, f, "in-progress")
	t.Run("tasks_populated", func(t *testing.T) {
		f := planned(t)
		f.Edit("status: draft", "status: planned")
		f.Edit("- [ ] T1 `src/a_test.go` - the failing test; fails because there is no code (AC-01)\n", "")
		f.Edit("- [ ] T2 `src/a.go` - the change; T1 passes (AC-01,\n      AC-02)\n", "")
		expect(t, f, "in-progress", "tasks_populated")
	})
}

func TestCompleteGate(t *testing.T) {
	expect(t, complete(t), "complete")
	cases := map[string]func(f *fixture){
		"all_met": func(f *fixture) {
			f.Edit("- [x] AC-02: The second end state.\n      Evidence: manual, abc1234, passed, none\n", "- [ ] AC-02: The second end state.\n")
		},
		"impl_review_fresh": func(f *fixture) {
			f.Write("src/a.go", "package a // after review\n")
			f.Commit("late change")
		},
		"impl_review_clean": func(f *fixture) {
			f.Row("R-3", rules.KindImplementation, f.Git("rev-parse", "--short=7", "HEAD"), "fable", "procedural", "Review.", implRecords(rec("AC-01", ac1, "met")))
		},
		"feature_tree_clean": func(f *fixture) { f.Write("src/wip.go", "package a\n") },
	}
	for cond, mutate := range cases {
		t.Run(cond, func(t *testing.T) {
			f := complete(t)
			mutate(f)
			expect(t, f, "complete", cond)
		})
	}
}

func TestImplReviewClean(t *testing.T) {
	head := func(f *fixture) string { return f.Head() }
	tests := []struct {
		name    string
		records string
		mutate  func(f *fixture)
		clean   bool
	}{
		{"all met", allMet, nil, true},
		{"missing record", implRecords(rec("AC-01", ac1, "met")), nil, false},
		{"extra record", allMet + "\n" + rec("AC-03", "Extra.", "met"), nil, false},
		{"duplicate record", allMet + "\n" + rec("AC-02", ac2, "met"), nil, false},
		{"changed text", implRecords(rec("AC-01", ac1, "met"), rec("AC-02", "The second state.", "met")), nil, false},
		{"text folds", implRecords(rec("AC-01", "The   first end state,  wrapped onto a second line.", "met"), rec("AC-02", ac2, "met")), nil, true},
		{"not met", implRecords(rec("AC-01", ac1, "met"), rec("AC-02", ac2, "not met")), nil, false},
		{"not verified with a residual", implRecords(rec("AC-01", ac1, "met"), rec("AC-02", ac2, "not verified")), func(f *fixture) {
			f.Edit("- [x] AC-02: The second end state.\n      Evidence: manual, abc1234, passed, none\n", "- [ ] AC-02: The second end state.\n      Residual: #12\n")
		}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := complete(t)
			if tt.mutate != nil {
				tt.mutate(f)
			}
			f.Row("R-3", rules.KindImplementation, head(f), "fable", "procedural", "Review.", tt.records)
			data, _, _ := f.gate("complete")
			if got := !slices.Contains(data.Failing, "impl_review_clean"); got != tt.clean {
				t.Fatalf("impl_review_clean holds = %v, want %v; failing %q", got, tt.clean, data.Failing)
			}
		})
	}
}

func TestSpecReviewClean(t *testing.T) {
	finding := func(sev string) string {
		return "FINDING: F-01\nKIND: factual\nSEVERITY: " + sev + "\nWHERE: Design\nEVIDENCE: x\nPROPOSAL: y"
	}
	for records, clean := range map[string]bool{
		"NO FINDINGS":                           true,
		finding("nit"):                          true,
		finding("should-fix"):                   true,
		finding("blocking"):                     false,
		"Looks fine.":                           false,
		finding("nit") + "\n\nNO FINDINGS":      false,
		"FINDING: F-01\nKIND: factual\n":        false,
		finding("nit") + "\n" + "SEVERITY: nit": false,
	} {
		f := planned(t)
		f.Row("R-2", rules.KindSpec, f.X, "fable", "procedural", "Review.", records)
		data, _, _ := f.gate("planned")
		if got := !slices.Contains(data.Failing, "spec_review_clean"); got != clean {
			t.Errorf("records %q: clean = %v, want %v", records, got, clean)
		}
	}
}

func TestTransitions(t *testing.T) {
	t.Run("not allowed, no gate", func(t *testing.T) {
		data, findings, result := planned(t).gate("archived")
		if result != report.Fail || data.Transition != "not-allowed" || len(data.Failing) != 0 {
			t.Fatalf("data %+v, result %q", data, result)
		}
		if !slices.ContainsFunc(findings, func(x report.Finding) bool { return x.Code == report.CodeTransitionNotAllowed }) {
			t.Fatalf("findings = %+v", findings)
		}
		if data.Line != "vh-adlc gate archived: fail (transition-not-allowed; rules 1, docs e4d58d2)" {
			t.Fatalf("line = %q", data.Line)
		}
	})
	t.Run("not allowed, with a gate", func(t *testing.T) {
		data, _, result := planned(t).gate("complete")
		if result != report.Fail || data.Transition != "not-allowed" || !slices.Contains(data.Failing, "all_met") {
			t.Fatalf("data %+v, result %q", data, result)
		}
		if !strings.HasPrefix(data.Line, "vh-adlc gate complete: fail (transition-not-allowed, ") {
			t.Fatalf("line = %q", data.Line)
		}
	})
	t.Run("re-check", func(t *testing.T) {
		f := complete(t)
		f.Edit("status: in-progress", "status: complete")
		data := expect(t, f, "complete")
		if data.Transition != "re-check" {
			t.Fatalf("transition = %q", data.Transition)
		}
	})
	t.Run("allowed without a gate", func(t *testing.T) {
		data, _, result := planned(t).gate("parked")
		if result != report.Pass || data.Transition != "allowed" {
			t.Fatalf("data %+v, result %q", data, result)
		}
	})
}

// TestSharedConditionsOnEveryTarget fails each condition the planned gate
// shares with the in-progress and complete gates alone on those targets too.
func TestSharedConditionsOnEveryTarget(t *testing.T) {
	noRow := strings.Replace(testrepo.File("docs/conforming.md"), "| AC-02 | A written manual procedure |\n", "", 1)
	question := func(f *fixture) { f.Edit("## Open Questions\n\nNone.\n", "## Open Questions\n\n### Q1: Which?\n") }
	blocking := func(f *fixture) {
		f.Row("R-3", rules.KindSpec, f.Head(), "fable", "procedural", "Review.", testrepo.Blocking)
	}
	unaccept := func(f *fixture) {
		f.Edit("| 2026-01-01 | R-1 | spec | `"+f.X+"` | n/a | n/a | accepted by owner |\n", "")
	}
	inProgress := func(t *testing.T, text string) *fixture {
		f := plannedFrom(t, text)
		f.Edit("status: draft", "status: planned")
		return f
	}
	targets := []struct {
		target string
		build  func(t *testing.T, text string) *fixture
		cases  map[string]func(f *fixture)
	}{
		{"in-progress", inProgress, map[string]func(f *fixture){
			"no_open_questions":  question,
			"spec_review_clean":  blocking,
			"accepted":           unaccept,
			"test_plan_complete": nil,
			"spec_review_fresh": func(f *fixture) {
				f.Write("src/drift.go", "package a\n")
				f.Commit("drift")
				f.Git("push", "-q", "origin", "main")
				f.Git("reset", "-q", "--hard", "HEAD~1")
			},
			"on_feature_branch_if_set": func(f *fixture) { f.Edit("status: planned", "status: planned\nbranch: feat") },
		}},
		{"complete", func(t *testing.T, text string) *fixture { return wrap(t, testrepo.CompleteFrom(t, text)) }, map[string]func(f *fixture){
			"no_open_questions":  question,
			"spec_review_clean":  blocking,
			"accepted":           unaccept,
			"test_plan_complete": nil,
			"spec_review_fresh": func(f *fixture) {
				f.Git("switch", "-q", "main")
				f.Write("src/drift.go", "package a\n")
				f.Commit("drift")
				f.Git("push", "-q", "origin", "main")
				f.Git("switch", "-q", "feat")
			},
			"on_feature_branch_if_set": func(f *fixture) { f.Git("switch", "-q", "-c", "other") },
		}},
	}
	for _, tg := range targets {
		for cond, mutate := range tg.cases {
			t.Run(tg.target+"/"+cond, func(t *testing.T) {
				var f *fixture
				if mutate == nil {
					f = tg.build(t, noRow)
				} else {
					f = tg.build(t, testrepo.File("docs/conforming.md"))
					mutate(f)
				}
				expect(t, f, tg.target, cond)
			})
		}
	}
}
