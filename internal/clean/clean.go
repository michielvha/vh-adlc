package clean

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/michielvha/vh-adlc/internal/gitcmd"
	"github.com/michielvha/vh-adlc/internal/report"
)

const cleanCommand = "clean"

// initialPIDNamespace is what /proc/self/ns/pid reads in the initial PID
// namespace. Inside any other, kill and /proc give wrong answers without
// failing.
const initialPIDNamespace = "pid:[4026531836]"

// The Git floor for clean: GIT_NO_LAZY_FETCH arrives in 2.45.
const (
	gitMajor = 2
	gitMinor = 45
)

// Options are the inputs of `vh-adlc clean`. Every host fact is a field, so
// tests can point it at a fake.
type Options struct {
	Repo      string
	DryRun    bool
	OlderThan time.Duration
	Compose   bool
	Kind      bool

	GOOS         string
	EUID         int
	PIDNamespace func() (string, error)
	GitVersion   func() string // nil runs git --version
	GitEnv       []string      // added to Git's environment; nil keeps the process environment
	Host         HostPaths
	Files        FileHost
	DockerHost   string
	KindHost     kindHost
}

// RealOptions fills the host facts of this machine.
func RealOptions() Options {
	uid := os.Getuid()
	config, _ := os.UserConfigDir()
	home, _ := os.UserHomeDir()
	return Options{
		EUID:         os.Geteuid(),
		PIDNamespace: func() (string, error) { return os.Readlink("/proc/self/ns/pid") },
		Host:         HostPaths{ConfigDir: config, Home: home, Tmp: "/tmp", UID: uid},
		Files:        RealFileHost(uid),
		DockerHost:   os.Getenv("DOCKER_HOST"),
		KindHost:     realKindHost(),
	}
}

// Data is the report's data. In a dry run, Removed and FreedBytes are what
// would go, and Unmerged is what a differing working-tree manifest would add.
type Data struct {
	DryRun     bool      `json:"dry_run"`
	Removed    []Item    `json:"removed"`
	Kept       []Item    `json:"kept"`
	NeedsFlag  []Item    `json:"needs_flag"`
	Unmerged   []Item    `json:"unmerged"`
	FreedBytes int64     `json:"freed_bytes"`
	Unmatched  Unmatched `json:"unmatched"`
}

// failing are the codes that fail a run, dry runs included, so the operation
// never applies after one. Every other code is a note.
var failing = []string{
	report.CodeRemovalFailed, report.CodeManifestInvalid, report.CodeEngineUnreachable,
	report.CodeKindUnavailable, report.CodeTempBaseRefused, report.CodeHostSettingsInvalid,
}

// Clean plans, and unless it is a dry run, removes what the repository's
// killed runs left behind.
func Clean(ctx context.Context, o Options) *report.Report {
	if f := refuse(ctx, o); f != nil {
		return report.New(cleanCommand, report.Error, *f)
	}
	var findings []report.Finding
	note := func(code, format string, a ...any) {
		findings = append(findings, report.Finding{Code: code, Message: fmt.Sprintf(format, a...)})
	}
	stop := func(err error) *report.Report {
		var c *CodedError
		if errors.As(err, &c) {
			return report.New(cleanCommand, report.Fail, append(findings, report.Finding{Code: c.Code, Message: c.Message})...)
		}
		return report.New(cleanCommand, report.Error, append(findings, report.Finding{Code: report.CodeError, Message: err.Error()})...)
	}

	base, err := LoadTempBase(o.Host, o.Repo)
	if err != nil {
		return stop(err)
	}
	if _, err := CheckBase(base, o.Host.UID); err != nil {
		return stop(err)
	}

	g := gitcmd.Git{Dir: o.Repo, Env: append(slices.Clone(o.GitEnv), "GIT_NO_LAZY_FETCH=1")}
	merged, mergedBytes, mf := defaultBranchManifest(ctx, g)
	if mf != nil {
		findings = append(findings, *mf)
	}
	var unmerged *Manifest
	if o.DryRun {
		m, f := workingTreeManifest(o.Repo, mergedBytes)
		switch {
		case f != nil:
			findings = append(findings, *f)
		case m != nil:
			unmerged = m
			note(report.CodeManifestUnmerged, "the working tree's %s differs from the default branch; a dry run plans it separately and an applied run never uses it", ManifestPath)
		}
	}

	var e *Engine
	if socket, ok := ResolveSocket(o.DockerHost); ok {
		e = NewEngine(socket)
	}
	state, err := listEngine(ctx, e)
	if err != nil {
		return stop(err)
	}
	if state.Absent {
		note(report.CodeEngineAbsent, "no Docker engine answered, so container bind mounts were not checked and no engine object was read")
	}

	data := Data{DryRun: o.DryRun}
	res, err := o.plan(ctx, e, state, base, merged)
	if err != nil {
		return stop(err)
	}
	data.Removed, data.Kept, data.NeedsFlag, data.Unmatched = res.removed, res.kept, res.needsFlag, res.unmatched
	findings = append(findings, res.failures...)
	if unmerged != nil {
		dry := o
		dry.DryRun = true
		other, err := dry.plan(ctx, e, state, base, unmerged)
		if err != nil {
			return stop(err)
		}
		data.Unmerged = added(append(other.removed, other.needsFlag...), append(slices.Clone(res.removed), res.needsFlag...))
	}
	for _, it := range data.Removed {
		data.FreedBytes += it.Bytes
	}

	result := report.Pass
	if o.DryRun {
		result = report.Answered
	}
	for _, f := range findings {
		if slices.Contains(failing, f.Code) {
			result = report.Fail
		}
	}
	rep := report.New(cleanCommand, result, findings...)
	rep.Data = data
	return rep
}

// refuse returns the finding that stops a run before it reads anything.
func refuse(ctx context.Context, o Options) *report.Finding {
	refusal := func(code, format string, a ...any) *report.Finding {
		return &report.Finding{Code: code, Message: fmt.Sprintf(format, a...)}
	}
	if o.GOOS != "linux" {
		return refusal(report.CodeUnsupportedPlatform, "clean supports Linux only, not %s", o.GOOS)
	}
	if o.EUID == 0 {
		return refusal(report.CodeRunningAsRoot, "clean does not run as root")
	}
	ns, err := o.PIDNamespace()
	if err != nil || ns != initialPIDNamespace {
		return refusal(report.CodePIDNamespace, "clean runs only in the initial PID namespace, where kill and /proc answer for the host; run it in a terminal")
	}
	var verr error
	if o.GitVersion != nil {
		verr = gitcmd.CheckVersionOutput(o.GitVersion(), gitMajor, gitMinor)
	} else {
		verr = gitcmd.Git{Dir: o.Repo}.CheckMinVersion(ctx, gitMajor, gitMinor)
	}
	if verr != nil {
		return refusal(report.CodeGitTooOld, "%v", verr)
	}
	return nil
}

// defaultBranchManifest reads the manifest from origin's default branch,
// never fetching. A missing ref or manifest is a note and gives no rules.
func defaultBranchManifest(ctx context.Context, g gitcmd.Git) (*Manifest, []byte, *report.Finding) {
	ref, err := g.Output(ctx, "symbolic-ref", "-q", "refs/remotes/origin/HEAD")
	if err != nil || ref == "" {
		return nil, nil, &report.Finding{Code: report.CodeDefaultBranchUnknown, Message: "no refs/remotes/origin/HEAD, so project rules were skipped; set it with git remote set-head origin --auto"}
	}
	branch := strings.TrimPrefix(ref, "refs/remotes/")
	invalid := func(format string, a ...any) (*Manifest, []byte, *report.Finding) {
		return nil, nil, &report.Finding{Code: report.CodeManifestInvalid, Message: fmt.Sprintf(format, a...), Path: ManifestPath}
	}
	tree, err := g.Output(ctx, "ls-tree", "-z", "--format=%(objecttype) %(objectname)", branch, "--", ManifestPath)
	if err != nil {
		return invalid("reading %s on %s without a fetch: %v", ManifestPath, branch, err)
	}
	tree = strings.TrimRight(tree, "\x00")
	if tree == "" {
		return nil, nil, &report.Finding{Code: report.CodeManifestMissing, Message: fmt.Sprintf("%s has no %s, so project rules were skipped", branch, ManifestPath), Path: ManifestPath}
	}
	kind, sha, _ := strings.Cut(tree, " ")
	if kind != "blob" {
		return invalid("%s on %s is not a file", ManifestPath, branch)
	}
	b, err := g.Run(ctx, "cat-file", "blob", sha)
	if err != nil {
		return invalid("reading %s on %s without a fetch: %v", ManifestPath, branch, err)
	}
	m, err := ParseManifest(b)
	if err != nil {
		_, _, f := invalid("%s on %s: %v", ManifestPath, branch, err)
		return nil, b, f // the bytes, so an identical working tree is not reported twice
	}
	return m, b, nil
}

// workingTreeManifest returns the working tree's manifest when it differs from
// the default branch's bytes.
func workingTreeManifest(repo string, merged []byte) (*Manifest, *report.Finding) {
	b, err := os.ReadFile(filepath.Join(repo, ManifestPath))
	if err != nil || bytes.Equal(b, merged) {
		return nil, nil
	}
	m, err := ParseManifest(b)
	if err != nil {
		return nil, &report.Finding{Code: report.CodeManifestInvalid, Message: fmt.Sprintf("the working tree's %v", err), Path: ManifestPath}
	}
	return m, nil
}

type planResult struct {
	removed, kept, needsFlag []Item
	unmatched                Unmatched
	failures                 []report.Finding
}

// plan runs the file, Compose and kind steps for one manifest, which may be
// nil for a repository with none.
func (o Options) plan(ctx context.Context, e *Engine, state engineState, base string, m *Manifest) (planResult, error) {
	var res planResult
	in := fileInputs{Rules: builtinRules(), TempBase: base, OlderThan: o.OlderThan, Binds: state.binds()}
	var compose []ComposeRule
	var kinds []KindRule
	if m != nil {
		for _, r := range m.Tmp {
			in.Rules = append(in.Rules, fileRule(r))
		}
		if m.TempRoot != nil {
			in.Project, in.RootAge = m.Project, m.TempRoot.MaxAge
		}
		compose, kinds = m.Compose, m.Kind
	}
	files, err := planFiles(o.Files, in)
	if err != nil {
		return res, err
	}
	res.unmatched = files.Unmatched
	if o.DryRun {
		res.removed, res.kept = files.Remove, files.Keep
	} else {
		var failures []report.Finding
		res.removed, res.kept, failures = applyFiles(files)
		res.failures = append(res.failures, failures...)
	}
	for _, step := range []engineResult{
		doCompose(ctx, e, state, compose, o.Compose, o.DryRun),
		doKind(ctx, e, state, kinds, o.KindHost, o.Kind, o.DryRun),
	} {
		res.removed = append(res.removed, step.Removed...)
		res.kept = append(res.kept, step.Kept...)
		res.needsFlag = append(res.needsFlag, step.NeedsFlag...)
		res.failures = append(res.failures, step.Failures...)
	}
	return res, nil
}

// added returns the items in other that are not in base, by kind and name.
func added(other, base []Item) []Item {
	var out []Item
	for _, it := range other {
		if !slices.ContainsFunc(base, func(b Item) bool { return b.Kind == it.Kind && b.Name == it.Name }) {
			out = append(out, it)
		}
	}
	return out
}
