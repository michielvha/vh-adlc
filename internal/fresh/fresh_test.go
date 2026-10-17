package fresh

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/internal/doc"
	"github.com/michielvha/vh-adlc/internal/gitcmd"
	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/rules"
	"github.com/michielvha/vh-adlc/internal/testrepo"
)

const docPath = "docs/f.md"

const logHeader = "| Date | Review | Kind | Commit | Model | Isolation | Outcome |\n| --- | --- | --- | --- | --- | --- | --- |\n"

type fixture struct {
	t    *testing.T
	repo *testrepo.Repo
	r    *rules.Rules
	text string
}

func newFixture(t *testing.T, remote bool) *fixture {
	t.Helper()
	r, err := rules.Parse([]byte(testrepo.Standard()))
	if err != nil {
		t.Fatal(err)
	}
	f := &fixture{t: t, repo: testrepo.New(t), r: r, text: testrepo.File("docs/conforming.md")}
	f.repo.Write(docPath, f.text)
	f.repo.Write("src/a.go", "package a\n")
	f.repo.Write("config.yml", "a: 1\n")
	f.repo.Write("README.md", "readme\n")
	f.repo.Commit("fixture")
	if remote {
		f.repo.AddRemote()
	}
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

// review appends a review row and its records for the commit.
func (f *fixture) review(id, kind, commit string) {
	f.t.Helper()
	records := "NO FINDINGS"
	if kind == rules.KindImplementation {
		records = "CRITERION: AC-01 The first end state, wrapped onto a second line.\nVERDICT: met\nEVIDENCE: x\n\nCRITERION: AC-02 The second end state.\nVERDICT: met\nEVIDENCE: x"
	}
	row := "| 2026-01-01 | " + id + " | " + kind + " | `" + commit + "` | fable | procedural | Review. |\n"
	f.text = strings.Replace(f.text, logHeader, logHeader+row, 1) + "\n### " + id + "\n\n" + records + "\n"
	f.repo.Write(docPath, f.text)
}

func (f *fixture) compute() (*Result, []report.Finding) {
	f.t.Helper()
	g := gitcmd.Git{Dir: f.repo.Dir, Env: testrepo.Env(f.repo.Home)}
	d := doc.Parse(docPath, []byte(f.text), f.r)
	res, findings, err := Compute(f.t.Context(), g, d)
	if err != nil {
		f.t.Fatalf("Compute: %v", err)
	}
	return res, findings
}

// reviewed commits the fixture state, then records spec review R-1 and
// implementation review R-2 at that commit and commits the rows.
func (f *fixture) reviewed() string {
	f.t.Helper()
	x := f.repo.Git("rev-parse", "HEAD")
	f.review("R-1", rules.KindSpec, x[:7])
	f.review("R-2", rules.KindImplementation, x[:7])
	f.repo.Commit("record reviews")
	return x
}

func want(t *testing.T, s State, stale bool, reasons ...string) {
	t.Helper()
	if s.Stale != stale || !slices.Equal(s.Reasons, reasons) {
		t.Fatalf("state = %+v, want stale %v with %q", s, stale, reasons)
	}
}

func TestFreshAfterReview(t *testing.T) {
	f := newFixture(t, true)
	x := f.reviewed()
	f.repo.Git("push", "-q", "origin", "main")
	res, _ := f.compute()
	want(t, res.SpecReview, false)
	want(t, res.ImplementationReview, false)
	if res.SpecReview.Commit != x[:7] || !res.FeatureTree.Clean || res.DefaultBranch != "main" || res.Remote != "origin" {
		t.Fatalf("result = %+v", res)
	}
	if res.RemoteSHA == nil || res.LocalSHA == nil || *res.RemoteSHA != *res.LocalSHA {
		t.Fatalf("remote %v, local %v", res.RemoteSHA, res.LocalSHA)
	}
}

func TestStaleReasons(t *testing.T) {
	t.Run("no review", func(t *testing.T) {
		f := newFixture(t, true)
		res, _ := f.compute()
		want(t, res.SpecReview, true, report.CodeNoReview)
		want(t, res.ImplementationReview, true, report.CodeNoReview)
	})
	t.Run("dirty target", func(t *testing.T) {
		f := newFixture(t, true)
		f.review("R-1", rules.KindSpec, f.repo.Git("rev-parse", "--short=7", "HEAD")+"+dirty")
		res, _ := f.compute()
		want(t, res.SpecReview, true, report.CodeDirtyTarget)
	})
	t.Run("missing object", func(t *testing.T) {
		f := newFixture(t, true)
		f.review("R-1", rules.KindSpec, "1234567")
		res, _ := f.compute()
		want(t, res.SpecReview, true, report.CodeCommitUnreachable)
	})
	t.Run("not an ancestor, as after a squash merge", func(t *testing.T) {
		f := newFixture(t, true)
		f.repo.Git("switch", "-q", "-c", "old")
		f.repo.Write("src/b.go", "package a\n")
		z := f.repo.Commit("work squashed away")
		f.repo.Git("switch", "-q", "main")
		f.review("R-1", rules.KindSpec, z[:7])
		res, _ := f.compute()
		want(t, res.SpecReview, true, report.CodeCommitUnreachable)
	})
	t.Run("baseline changed", func(t *testing.T) {
		f := newFixture(t, true)
		f.reviewed()
		f.edit("The second end state.", "The second, revised end state.")
		f.repo.Commit("revise")
		res, _ := f.compute()
		want(t, res.SpecReview, true, report.CodeBaselineChanged)
		want(t, res.ImplementationReview, true, report.CodeBaselineChanged)
	})
	t.Run("annotation-only edits", func(t *testing.T) {
		f := newFixture(t, true)
		f.reviewed()
		f.edit("- [ ] AC-02: The second end state.\n", "- [x] AC-02: The second end state.\n      Evidence: ran it at abc1234,\n      wrapped onto a second line\n")
		f.edit("- [ ] AC-01:", "- [ ] AC-01:")
		f.edit("- [ ] T1 ", "- [x] T1 ")
		f.edit("status: draft", "status: planned")
		f.repo.Commit("annotate")
		res, _ := f.compute()
		want(t, res.SpecReview, false)
		want(t, res.ImplementationReview, false)
	})
}

// featureBranch reviews main, pushes it and starts branch feat from it.
func featureBranch(t *testing.T) *fixture {
	t.Helper()
	f := newFixture(t, true)
	f.reviewed()
	f.repo.Git("push", "-q", "origin", "main")
	f.repo.Git("switch", "-q", "-c", "feat")
	return f
}

// pushToMain commits a change on main, pushes it and returns to feat.
func pushToMain(f *fixture, path string) {
	f.repo.Git("switch", "-q", "main")
	f.repo.Write(path, "changed\n")
	f.repo.Commit("other work")
	f.repo.Git("push", "-q", "origin", "main")
	f.repo.Git("switch", "-q", "feat")
}

func TestDrift(t *testing.T) {
	t.Run("covered drift on the default branch", func(t *testing.T) {
		f := featureBranch(t)
		pushToMain(f, "src/other.go")
		res, findings := f.compute()
		want(t, res.SpecReview, true, report.CodeCoveredDrift)
		want(t, res.ImplementationReview, false)
		if !slices.ContainsFunc(findings, func(x report.Finding) bool { return x.Code == report.CodeCoveredDrift && x.Path == "src/other.go" }) {
			t.Fatalf("findings = %+v", findings)
		}
	})
	t.Run("uncovered drift", func(t *testing.T) {
		f := featureBranch(t)
		pushToMain(f, "README.md")
		res, _ := f.compute()
		want(t, res.SpecReview, false)
	})
	t.Run("covered commit on the feature branch", func(t *testing.T) {
		f := featureBranch(t)
		f.repo.Write("src/a.go", "package a // changed\n")
		f.repo.Commit("feature work")
		res, _ := f.compute()
		want(t, res.SpecReview, false)
		want(t, res.ImplementationReview, true, report.CodeCoveredChanged)
	})
	for _, renames := range []string{"true", "false"} {
		t.Run("covered rename with diff.renames "+renames, func(t *testing.T) {
			f := featureBranch(t)
			f.repo.Git("config", "diff.renames", renames)
			f.repo.Git("config", "status.renames", renames)
			f.repo.Git("mv", "src/a.go", "lib.go")
			f.repo.Commit("move out of covers")
			res, findings := f.compute()
			want(t, res.ImplementationReview, true, report.CodeCoveredChanged)
			if !slices.ContainsFunc(findings, func(x report.Finding) bool { return x.Path == "src/a.go" }) {
				t.Fatalf("findings = %+v", findings)
			}
		})
	}
	t.Run("merged feature drifts against its own spec review", func(t *testing.T) {
		f := featureBranch(t)
		f.repo.Write("src/a.go", "package a // feature\n")
		f.repo.Commit("feature work")
		f.repo.Git("switch", "-q", "main")
		f.repo.Git("merge", "-q", "--no-ff", "-m", "merge feat", "feat")
		f.repo.Git("push", "-q", "origin", "main")
		f.repo.Git("switch", "-q", "feat")
		f.repo.Git("merge", "-q", "--ff-only", "main")
		res, _ := f.compute()
		want(t, res.SpecReview, true, report.CodeCoveredDrift)

		e := f.repo.Git("rev-parse", "HEAD")
		f.review("R-3", rules.KindSpec, e[:7])
		res, _ = f.compute()
		want(t, res.SpecReview, false)
	})
}

func TestFeatureTree(t *testing.T) {
	f := newFixture(t, true)
	f.reviewed()
	f.repo.Write("src/s.go", "package a\n")
	f.repo.Git("add", "src/s.go")
	f.repo.Write("config.yml", "a: 2\n")
	f.repo.Write("src/u.go", "package a\n")
	f.repo.Write("notes.txt", "unrelated\n")
	f.repo.Write(".gitignore", "ignored/\n")
	f.repo.Write("src/ignored/x.go", "x\n")
	f.repo.Write("src/.gitignore", "ignored/\n")
	f.edit("Why the fixture exists.", "Edited in the working tree.")
	index := filepath.Join(f.repo.Dir, ".git", "index")
	before, err := os.ReadFile(index)
	if err != nil {
		t.Fatal(err)
	}
	res, findings := f.compute()
	if res.FeatureTree.Clean || !slices.Equal(res.FeatureTree.Paths, []string{"config.yml", "src/.gitignore", "src/s.go", "src/u.go"}) {
		t.Fatalf("feature tree = %+v", res.FeatureTree)
	}
	n := 0
	for _, x := range findings {
		if x.Code == report.CodeFeatureTreeDirty {
			n++
		}
	}
	if n != 4 {
		t.Fatalf("feature-tree-dirty findings = %d, want 4: %+v", n, findings)
	}
	after, _ := os.ReadFile(index)
	if string(before) != string(after) {
		t.Fatal("computing freshness rewrote the index")
	}
}

func TestDefaultBranch(t *testing.T) {
	t.Run("no remote uses the local default branch", func(t *testing.T) {
		f := newFixture(t, false)
		f.reviewed()
		res, _ := f.compute()
		if res.Remote != "none" || res.RemoteSHA != nil || res.DefaultBranch != "main" {
			t.Fatalf("result = %+v", res)
		}
		want(t, res.SpecReview, false)
	})
	for name, setup := range map[string]func(f *fixture){
		"remote without origin HEAD": func(f *fixture) {
			f.repo.AddRemote()
			f.repo.Git("remote", "set-head", "origin", "--delete")
		},
		"only an upstream remote": func(f *fixture) {
			f.repo.Git("remote", "add", "upstream", f.t.TempDir())
		},
	} {
		t.Run(name, func(t *testing.T) {
			f := newFixture(t, false)
			setup(f)
			g := gitcmd.Git{Dir: f.repo.Dir, Env: testrepo.Env(f.repo.Home)}
			_, _, err := Compute(t.Context(), g, doc.Parse(docPath, []byte(f.text), f.r))
			var e *Error
			if !errors.As(err, &e) || e.Code != report.CodeDefaultBranchUnknown {
				t.Fatalf("err = %v, want default-branch-unknown", err)
			}
		})
	}
}
