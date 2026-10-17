package next

import (
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/internal/doc"
	"github.com/michielvha/vh-adlc/internal/gitcmd"
	"github.com/michielvha/vh-adlc/internal/rules"
	"github.com/michielvha/vh-adlc/internal/testrepo"
)

func conforming() string { return testrepo.File("docs/conforming.md") }

func answer(t *testing.T, f *testrepo.Feature) *Data {
	t.Helper()
	r, err := rules.Parse([]byte(testrepo.Standard()))
	if err != nil {
		t.Fatal(err)
	}
	d := doc.Parse(testrepo.FeaturePath, []byte(f.Text), r)
	if len(d.Shape) > 0 {
		t.Fatalf("fixture is malformed: %+v", d.Shape)
	}
	data, err := Evaluate(t.Context(), gitcmd.Git{Dir: f.Dir, Env: testrepo.Env(f.Home)}, d)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	return data
}

// tasksDone ticks both tasks of a Complete fixture.
func tasksDone(f *testrepo.Feature) {
	f.Edit("- [ ] T1 ", "- [x] T1 ")
	f.Edit("- [ ] T2 ", "- [x] T2 ")
}

func TestRules(t *testing.T) {
	noTasks := func(f *testrepo.Feature) {
		f.Edit("- [ ] T1 `src/a_test.go` - the failing test; fails because there is no code (AC-01)\n", "")
		f.Edit("- [ ] T2 `src/a.go` - the change; T1 passes (AC-01,\n      AC-02)\n", "")
	}
	tests := []struct {
		name   string
		build  func(t *testing.T) *testrepo.Feature
		rule   int
		action string
	}{
		{"open question", func(t *testing.T) *testrepo.Feature {
			f := testrepo.Planned(t, conforming())
			f.Edit("## Open Questions\n\nNone.\n", "## Open Questions\n\n### Q1: Which?\n")
			return f
		}, 1, "owner decision"},
		{"wrong branch", func(t *testing.T) *testrepo.Feature {
			f := testrepo.Planned(t, conforming())
			f.Edit("status: draft", "status: draft\nbranch: feat")
			return f
		}, 2, "owner decision"},
		{"test plan incomplete", func(t *testing.T) *testrepo.Feature {
			return testrepo.Planned(t, strings.Replace(conforming(), "| AC-02 | A written manual procedure |\n", "", 1))
		}, 3, "spec"},
		{"no spec review", func(t *testing.T) *testrepo.Feature {
			f := &testrepo.Feature{Repo: testrepo.New(t), Text: conforming()}
			f.Write(testrepo.FeaturePath, f.Text)
			f.Commit("draft")
			f.AddRemote()
			return f
		}, 4, "spec review"},
		{"blocking spec review", func(t *testing.T) *testrepo.Feature {
			f := testrepo.Planned(t, conforming())
			f.Row("R-2", "spec", f.X, "fable", "procedural", "Review.", testrepo.Blocking)
			return f
		}, 5, "spec"},
		{"not accepted", func(t *testing.T) *testrepo.Feature {
			f := testrepo.Planned(t, conforming())
			f.Edit("| 2026-01-01 | R-1 | spec | `"+f.X+"` | n/a | n/a | accepted by owner |\n", "")
			return f
		}, 6, "owner acceptance"},
		{"accepted draft", func(t *testing.T) *testrepo.Feature {
			return testrepo.Planned(t, conforming())
		}, 7, "spec"},
		{"planned without tasks", func(t *testing.T) *testrepo.Feature {
			f := testrepo.Planned(t, conforming())
			f.Edit("status: draft", "status: planned")
			noTasks(f)
			return f
		}, 8, "tasks"},
		{"planned with tasks", func(t *testing.T) *testrepo.Feature {
			f := testrepo.Planned(t, conforming())
			f.Edit("status: draft", "status: planned")
			return f
		}, 9, "implement"},
		{"open tasks", func(t *testing.T) *testrepo.Feature {
			return testrepo.Complete(t)
		}, 10, "implement"},
		{"dirty feature tree", func(t *testing.T) *testrepo.Feature {
			f := testrepo.Complete(t)
			tasksDone(f)
			f.Write("src/wip.go", "package a\n")
			return f
		}, 11, "implement"},
		{"stale implementation review", func(t *testing.T) *testrepo.Feature {
			f := testrepo.Complete(t)
			tasksDone(f)
			f.Write("src/a.go", "package a // later\n")
			f.Commit("later")
			return f
		}, 12, "review"},
		{"unclean implementation review", func(t *testing.T) *testrepo.Feature {
			f := testrepo.Complete(t)
			tasksDone(f)
			f.Row("R-3", "implementation", f.Head(), "fable", "procedural", "Review.", testrepo.Record("AC-01", testrepo.AC1, "met"))
			return f
		}, 13, "tasks"},
		{"criteria not met", func(t *testing.T) *testrepo.Feature {
			f := testrepo.Complete(t)
			tasksDone(f)
			f.Edit("- [x] AC-02: The second end state.\n      Evidence: manual, abc1234, passed, none\n", "- [ ] AC-02: The second end state.\n")
			return f
		}, 14, "tasks"},
		{"ready to ship", func(t *testing.T) *testrepo.Feature {
			f := testrepo.Complete(t)
			tasksDone(f)
			return f
		}, 15, "ship"},
		{"blocked", func(t *testing.T) *testrepo.Feature {
			f := testrepo.Planned(t, conforming())
			f.Edit("status: draft", "status: blocked")
			return f
		}, 16, "owner decision"},
		{"complete", func(t *testing.T) *testrepo.Feature {
			f := testrepo.Planned(t, conforming())
			f.Edit("status: draft", "status: archived")
			return f
		}, 17, "none"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := answer(t, tt.build(t))
			if got.Rule != tt.rule || got.Action != tt.action {
				t.Fatalf("next = rule %d %q (%s), want rule %d %q", got.Rule, got.Action, got.Reason, tt.rule, tt.action)
			}
		})
	}
}

// After an interruption, an active feature with a fresh blocking re-review
// or an unanswered question goes back to the spec or the owner, never on to
// implementation or shipping.
func TestResume(t *testing.T) {
	t.Run("blocking re-review", func(t *testing.T) {
		f := testrepo.Complete(t)
		tasksDone(f)
		f.Row("R-3", "spec", f.Head(), "fable", "procedural", "Review.", testrepo.Blocking)
		if got := answer(t, f); got.Action != "spec" {
			t.Fatalf("next = %+v", got)
		}
	})
	t.Run("unanswered question", func(t *testing.T) {
		f := testrepo.Complete(t)
		tasksDone(f)
		f.Edit("## Open Questions\n\nNone.\n", "## Open Questions\n\n### Q1: Which?\n")
		if got := answer(t, f); got.Action != "owner decision" {
			t.Fatalf("next = %+v", got)
		}
	})
}
