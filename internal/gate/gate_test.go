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

const (
	docPath   = "docs/f.md"
	logHeader = "| Date | Review | Kind | Commit | Model | Isolation | Outcome |\n| --- | --- | --- | --- | --- | --- | --- |\n"
	revision  = "e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a"
	ac1       = "The first end state, wrapped onto a second line."
	ac2       = "The second end state."
)

func implRecords(lines ...string) string { return strings.Join(lines, "\n") }

func rec(id, text, verdict string) string {
	return "CRITERION: " + id + " " + text + "\nVERDICT: " + verdict + "\nEVIDENCE: observed\n"
}

var allMet = implRecords(rec("AC-01", ac1, "met"), rec("AC-02", ac2, "met"))

type fixture struct {
	t    *testing.T
	repo *testrepo.Repo
	r    *rules.Rules
	text string
	x    string // the reviewed commit
}

// planned builds a draft document with a clean spec review and an acceptance
// at commit x, pushed to origin.
func planned(t *testing.T) *fixture {
	t.Helper()
	r, err := rules.Parse([]byte(testrepo.Standard()))
	if err != nil {
		t.Fatal(err)
	}
	f := &fixture{t: t, repo: testrepo.New(t), r: r, text: testrepo.File("docs/conforming.md")}
	f.repo.Write(docPath, f.text)
	f.repo.Write("src/a.go", "package a\n")
	f.x = f.repo.Commit("fixture")[:7]
	f.row("R-1", rules.KindSpec, f.x, "fable", "procedural", "Review.", "NO FINDINGS")
	f.row("R-1", rules.KindSpec, f.x, "n/a", "n/a", "accepted by owner", "")
	f.repo.Commit("accept")
	f.repo.AddRemote()
	return f
}

// complete extends planned to an in-progress document on branch feat with
// every criterion met and a clean implementation review.
func complete(t *testing.T) *fixture {
	t.Helper()
	f := planned(t)
	f.repo.Git("switch", "-q", "-c", "feat")
	f.edit("status: draft", "status: in-progress\nbranch: feat")
	f.repo.Write("src/a.go", "package a // built\n")
	built := f.repo.Commit("build")[:7]
	f.edit("- [ ] AC-01: ", "- [x] AC-01: ")
	f.edit("      wrapped onto a second line.\n", "      wrapped onto a second line.\n      Evidence: go test, abc1234, passed, none\n")
	f.edit("- [ ] AC-02: The second end state.\n", "- [x] AC-02: The second end state.\n      Evidence: manual, abc1234, passed, none\n")
	f.row("R-2", rules.KindImplementation, built, "fable", "procedural", "Review.", allMet)
	f.repo.Commit("record")
	return f
}

func (f *fixture) edit(from, to string) {
	f.t.Helper()
	if !strings.Contains(f.text, from) {
		f.t.Fatalf("document has no %q", from)
	}
	f.text = strings.Replace(f.text, from, to, 1)
	f.repo.Write(docPath, f.text)
}

func (f *fixture) row(id, kind, commit, model, isolation, outcome, records string) {
	f.t.Helper()
	line := "| 2026-01-01 | " + id + " | " + kind + " | `" + commit + "` | " + model + " | " + isolation + " | " + outcome + " |\n"
	i := strings.Index(f.text, logHeader) + len(logHeader)
	for strings.HasPrefix(f.text[i:], "|") {
		i += strings.Index(f.text[i:], "\n") + 1
	}
	f.text = f.text[:i] + line + f.text[i:]
	if records != "" {
		f.text += "\n### " + id + "\n\n" + records + "\n"
	}
	f.repo.Write(docPath, f.text)
}

func (f *fixture) gate(target string) (*Data, []report.Finding, report.Result) {
	f.t.Helper()
	g := gitcmd.Git{Dir: f.repo.Dir, Env: testrepo.Env(f.repo.Home)}
	d := doc.Parse(docPath, []byte(f.text), f.r)
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
		"no_open_questions": func(f *fixture) { f.edit("## Open Questions\n\nNone.\n", "## Open Questions\n\n### Q1: Which?\n") },
		"test_plan_complete": func(f *fixture) {
			f.edit("| AC-02 | A written manual procedure |\n", "")
		},
		"spec_review_fresh": func(f *fixture) {
			f.repo.Write("src/drift.go", "package a\n")
			f.repo.Commit("drift")
			f.repo.Git("push", "-q", "origin", "main")
			f.repo.Git("reset", "-q", "--hard", "HEAD~1")
		},
		"spec_review_clean": func(f *fixture) {
			f.row("R-2", rules.KindSpec, f.x, "fable", "procedural", "Review.", "FINDING: F-01\nKIND: factual\nSEVERITY: blocking\nWHERE: Design\nEVIDENCE: x\nPROPOSAL: y")
		},
		"accepted": func(f *fixture) {
			f.edit("| 2026-01-01 | R-1 | spec | `"+f.x+"` | n/a | n/a | accepted by owner |\n", "")
		},
		"on_feature_branch_if_set": func(f *fixture) { f.edit("status: draft", "status: draft\nbranch: feat") },
	}
	for cond, mutate := range cases {
		t.Run(cond, func(t *testing.T) {
			f := planned(t)
			mutate(f)
			expect(t, f, "planned", cond)
		})
	}
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
		f.edit(ac2, "The second, revised end state.")
		f.repo.Commit("revise")
		expect(t, f, "planned", "spec_review_fresh", "accepted")
	})
}

func TestInProgressGate(t *testing.T) {
	f := planned(t)
	f.edit("status: draft", "status: planned")
	expect(t, f, "in-progress")
	t.Run("tasks_populated", func(t *testing.T) {
		f := planned(t)
		f.edit("status: draft", "status: planned")
		f.edit("- [ ] T1 `src/a_test.go` - the failing test; fails because there is no code (AC-01)\n", "")
		f.edit("- [ ] T2 `src/a.go` - the change; T1 passes (AC-01,\n      AC-02)\n", "")
		expect(t, f, "in-progress", "tasks_populated")
	})
}

func TestCompleteGate(t *testing.T) {
	expect(t, complete(t), "complete")
	cases := map[string]func(f *fixture){
		"all_met": func(f *fixture) {
			f.edit("- [x] AC-02: The second end state.\n      Evidence: manual, abc1234, passed, none\n", "- [ ] AC-02: The second end state.\n")
		},
		"impl_review_fresh": func(f *fixture) {
			f.repo.Write("src/a.go", "package a // after review\n")
			f.repo.Commit("late change")
		},
		"impl_review_clean": func(f *fixture) {
			f.row("R-3", rules.KindImplementation, f.repo.Git("rev-parse", "--short=7", "HEAD"), "fable", "procedural", "Review.", implRecords(rec("AC-01", ac1, "met")))
		},
		"feature_tree_clean": func(f *fixture) { f.repo.Write("src/wip.go", "package a\n") },
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
	head := func(f *fixture) string { return f.repo.Git("rev-parse", "--short=7", "HEAD") }
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
			f.edit("- [x] AC-02: The second end state.\n      Evidence: manual, abc1234, passed, none\n", "- [ ] AC-02: The second end state.\n      Residual: #12\n")
		}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := complete(t)
			if tt.mutate != nil {
				tt.mutate(f)
			}
			f.row("R-3", rules.KindImplementation, head(f), "fable", "procedural", "Review.", tt.records)
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
		f.row("R-2", rules.KindSpec, f.x, "fable", "procedural", "Review.", records)
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
		f.edit("status: in-progress", "status: complete")
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
