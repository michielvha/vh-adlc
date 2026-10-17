// Package fresh decides whether a feature document's latest spec and
// implementation reviews are still current, from Git alone. It never fetches;
// the operation fetches the default branch before calling it.
package fresh

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/michielvha/vh-adlc/internal/doc"
	"github.com/michielvha/vh-adlc/internal/gitcmd"
	"github.com/michielvha/vh-adlc/internal/knowledge"
	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/rules"
)

// Error is a problem that stops the freshness answer; Code is its finding code.
type Error struct {
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

// State is one review's freshness.
type State struct {
	Review  string   `json:"review"`
	Commit  string   `json:"commit"`
	Stale   bool     `json:"stale"`
	Reasons []string `json:"reasons"`
}

// Tree is the feature's part of the working tree.
type Tree struct {
	Clean bool     `json:"clean"`
	Paths []string `json:"paths"`
}

// Result is the answer of vh-adlc fresh.
type Result struct {
	DefaultBranch        string  `json:"default_branch"`
	Remote               string  `json:"remote"`
	RemoteSHA            *string `json:"remote_sha"`
	LocalSHA             *string `json:"local_sha"`
	SpecReview           State   `json:"spec_review"`
	ImplementationReview State   `json:"implementation_review"`
	FeatureTree          Tree    `json:"feature_tree"`
}

type computer struct {
	ctx      context.Context
	g        gitcmd.Git
	d        *doc.Doc
	base     []byte
	findings []report.Finding
}

// Compute answers the freshness of the document's reviews.
func Compute(ctx context.Context, g gitcmd.Git, d *doc.Doc) (*Result, []report.Finding, error) {
	res := &Result{}
	baseRef, err := defaultBranch(ctx, g, res)
	if err != nil {
		return nil, nil, err
	}
	c := &computer{ctx: ctx, g: g, d: d, base: d.Baseline()}
	if res.SpecReview, err = c.state(rules.KindSpec, baseRef); err != nil {
		return nil, nil, err
	}
	if res.ImplementationReview, err = c.state(rules.KindImplementation, ""); err != nil {
		return nil, nil, err
	}
	if res.FeatureTree, err = c.tree(); err != nil {
		return nil, nil, err
	}
	return res, c.findings, nil
}

func ptr(s string) *string { return &s }

// defaultBranch fills the default-branch fields and returns the ref spec
// drift is measured against.
func defaultBranch(ctx context.Context, g gitcmd.Git, res *Result) (string, error) {
	remotes, err := g.Output(ctx, "remote")
	if err != nil {
		return "", &Error{Code: report.CodeError, Message: fmt.Sprintf("listing remotes: %v", err)}
	}
	local := func(name string) {
		if sha, err := g.Output(ctx, "rev-parse", "--verify", "-q", "refs/heads/"+name); err == nil {
			res.LocalSHA = ptr(sha)
		}
	}
	if remotes != "" {
		ref, err := g.Output(ctx, "symbolic-ref", "-q", "refs/remotes/origin/HEAD")
		if err != nil {
			return "", &Error{Code: report.CodeDefaultBranchUnknown, Message: "the repository has a remote but no refs/remotes/origin/HEAD; set it with git remote set-head origin --auto"}
		}
		res.Remote = "origin"
		res.DefaultBranch = strings.TrimPrefix(ref, "refs/remotes/origin/")
		sha, err := g.Output(ctx, "rev-parse", "--verify", "-q", ref)
		if err != nil {
			return "", &Error{Code: report.CodeDefaultBranchUnknown, Message: fmt.Sprintf("%s does not resolve to a commit", ref)}
		}
		res.RemoteSHA = ptr(sha)
		local(res.DefaultBranch)
		return ref, nil
	}
	name, err := g.Output(ctx, "var", "GIT_DEFAULT_BRANCH")
	if err != nil || name == "" {
		return "", &Error{Code: report.CodeDefaultBranchUnknown, Message: "git var GIT_DEFAULT_BRANCH gave no branch"}
	}
	res.Remote, res.DefaultBranch = "none", name
	local(name)
	if res.LocalSHA == nil {
		return "", &Error{Code: report.CodeDefaultBranchUnknown, Message: fmt.Sprintf("the repository has no remote and no local %s branch", name)}
	}
	return "refs/heads/" + name, nil
}

func (c *computer) add(code, path, format string, a ...any) {
	c.findings = append(c.findings, report.Finding{Code: code, Message: fmt.Sprintf(format, a...), Path: path})
}

// state answers one review's freshness. A non-empty baseRef measures covered
// drift on the default branch since the reviewed commit's merge base (spec
// reviews); an empty one measures covered changes from the reviewed commit to
// HEAD (implementation reviews).
func (c *computer) state(kind, baseRef string) (State, error) {
	s := State{Reasons: []string{}}
	rv := c.d.LatestReview(kind)
	stale := func(code, format string, a ...any) {
		s.Stale = true
		s.Reasons = append(s.Reasons, code)
		c.add(code, c.d.Path, "%s review %s: %s", kind, s.Review, fmt.Sprintf(format, a...))
	}
	if rv == nil {
		s.Stale = true
		s.Reasons = append(s.Reasons, report.CodeNoReview)
		c.add(report.CodeNoReview, c.d.Path, "the document has no %s review row", kind)
		return s, nil
	}
	s.Review, s.Commit = rv.ID, rv.Commit
	if rv.Dirty {
		stale(report.CodeDirtyTarget, "it reviewed uncommitted work (%s), which never counts as current", rv.RawCommit)
		return s, nil
	}
	if _, err := c.g.Run(c.ctx, "cat-file", "-e", rv.Commit+"^{commit}"); err != nil {
		stale(report.CodeCommitUnreachable, "commit %s does not exist in this repository", rv.Commit)
		return s, nil
	}
	if _, err := c.g.Run(c.ctx, "merge-base", "--is-ancestor", rv.Commit, "HEAD"); err != nil {
		if gitcmd.ExitCode(err) != 1 {
			return s, &Error{Code: report.CodeError, Message: fmt.Sprintf("checking whether %s is an ancestor of HEAD: %v", rv.Commit, err)}
		}
		stale(report.CodeCommitUnreachable, "commit %s is not an ancestor of HEAD, as after a squash merge", rv.Commit)
		return s, nil
	}
	raw, err := c.g.Run(c.ctx, "show", rv.Commit+":"+c.d.Path)
	if err != nil || !bytes.Equal(doc.Baseline(raw, c.d.Rules()), c.base) {
		stale(report.CodeBaselineChanged, "the normative baseline differs from the reviewed commit %s", rv.Commit)
	}
	args := []string{"diff", "--name-only", "-z", "--no-renames", rv.Commit, "HEAD"}
	code, what := report.CodeCoveredChanged, "changed since the reviewed commit"
	if baseRef != "" {
		args = []string{"diff", "--name-only", "-z", "--no-renames", rv.Commit + "..." + baseRef}
		code, what = report.CodeCoveredDrift, "changed on the default branch since the reviewed commit"
	}
	out, err := c.g.Run(c.ctx, args...)
	if err != nil {
		return s, &Error{Code: report.CodeError, Message: fmt.Sprintf("diffing covered paths: %v", err)}
	}
	paths := c.covered(gitcmd.SplitZ(out))
	if len(paths) > 0 {
		s.Stale = true
		s.Reasons = append(s.Reasons, code)
		for _, p := range paths {
			c.add(code, p, "%s review %s: covered path %s %s", kind, rv.ID, p, what)
		}
	}
	return s, nil
}

func (c *computer) covered(paths []string) []string {
	var out []string
	for _, p := range paths {
		if p != c.d.Path && doc.MatchCovers(c.d.Covers, p) && !slices.Contains(out, p) {
			out = append(out, p)
		}
	}
	slices.Sort(out)
	return out
}

func (c *computer) tree() (Tree, error) {
	out, err := c.g.Run(c.ctx, "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all")
	if err != nil {
		return Tree{}, &Error{Code: report.CodeError, Message: fmt.Sprintf("reading the working tree status: %v", err)}
	}
	var paths []string
	for _, rec := range gitcmd.SplitZ(out) {
		if len(rec) > 3 {
			paths = append(paths, rec[3:])
		}
	}
	t := Tree{Paths: c.covered(paths)}
	if t.Paths == nil {
		t.Paths = []string{}
	}
	t.Clean = len(t.Paths) == 0
	for _, p := range t.Paths {
		c.add(report.CodeFeatureTreeDirty, p, "covered path %s has staged, unstaged or untracked changes; commit this feature's changes before review", p)
	}
	return t, nil
}

// Command answers vh-adlc fresh.
func Command(ctx context.Context, ko knowledge.Options, docPath string) *report.Report {
	env, rep := doc.Open(ctx, "fresh", ko, docPath)
	if rep != nil {
		return rep
	}
	if len(env.Doc.Shape) > 0 {
		return env.Report("fresh", report.Malformed, env.Doc.Shape...)
	}
	res, findings, err := Compute(ctx, env.K.Git, env.Doc)
	if err != nil {
		return env.Report("fresh", report.Error, ErrorFinding(err))
	}
	rep = env.Report("fresh", report.Answered, findings...)
	rep.Data = res
	return rep
}

// ErrorFinding turns a Compute error into its finding.
func ErrorFinding(err error) report.Finding {
	var e *Error
	if errors.As(err, &e) {
		return report.Finding{Code: e.Code, Message: e.Message}
	}
	return report.Finding{Code: report.CodeError, Message: err.Error()}
}
