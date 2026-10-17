// Package knowledge resolves which vhco-pro/docs revision a repository
// follows, reads the pages an operation needs at that revision, and loads the
// rules block from the feature-document standard.
package knowledge

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/michielvha/vh-adlc/internal/gitcmd"
	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/rules"
)

// StandardPage is the docs page that holds the rules block. It is always read.
const StandardPage = "conventions/feature-documents.md"

// BaseURL is the host pages are read from. Only tests replace it; no flag or
// environment variable can point the binary elsewhere.
var BaseURL = "https://raw.githubusercontent.com"

var client = &http.Client{Timeout: 10 * time.Second}

// bridges are the files a repository pin is read from.
var bridges = []string{".github/copilot-instructions.md", "AGENTS.md", "CLAUDE.md"}

var (
	pinLink = regexp.MustCompile("https://github\\.com/vhco-pro/docs/blob/([^/\\s)>\\]\"'`]+)/")
	fullSHA = regexp.MustCompile(`^[0-9a-f]{40}$`)
)

// Options are the inputs of a resolution.
type Options struct {
	Repo       string
	PluginPin  string
	Offline    bool
	DocsSource string
	Pages      []string
	// CacheDir is the user cache directory; empty means os.UserCacheDir.
	CacheDir string
}

// Resolved is a usable docs revision with its rules and pages.
type Resolved struct {
	report.Knowledge
	Root  string
	Rules *rules.Rules
	Pages map[string][]byte
	Git   gitcmd.Git
}

// Resolve resolves the docs revision for the repository. On success the
// result is report.Answered; otherwise Resolved is nil and the findings say
// why.
func Resolve(ctx context.Context, o Options) (*Resolved, report.Result, []report.Finding) {
	pages, err := cleanPages(o.Pages)
	if err != nil {
		return nil, report.Usage, []report.Finding{{Code: report.CodeUsage, Message: err.Error()}}
	}
	g := gitcmd.Git{Dir: o.Repo}
	if err := g.CheckVersion(ctx); err != nil {
		var old *gitcmd.TooOldError
		if errors.As(err, &old) {
			return nil, report.Error, []report.Finding{{Code: report.CodeGitTooOld, Message: err.Error()}}
		}
		return nil, report.Error, []report.Finding{{Code: report.CodeError, Message: err.Error()}}
	}
	root, err := g.Output(ctx, "rev-parse", "--show-toplevel")
	if err != nil {
		return nil, report.Error, []report.Finding{{Code: report.CodeError, Message: fmt.Sprintf("%s is not inside a Git working tree", o.Repo)}}
	}
	g.Dir = root

	k, findings := pin(root, o.PluginPin)
	if findings != nil {
		return nil, report.InvalidPin, findings
	}
	k.Override = o.DocsSource != ""

	cacheDir := o.CacheDir
	if cacheDir == "" && o.DocsSource == "" {
		if cacheDir, err = os.UserCacheDir(); err != nil {
			return nil, report.Error, []report.Finding{{Code: report.CodeError, Message: fmt.Sprintf("finding the user cache directory: %v", err)}}
		}
	}
	f := fetcher{revision: k.Revision, offline: o.Offline, source: o.DocsSource, cacheDir: cacheDir}
	read := map[string][]byte{}
	var missing, unreachable []report.Finding
	for _, p := range append(pages, StandardPage) {
		if _, done := read[p]; done {
			continue
		}
		body, status, msg := f.fetch(ctx, p)
		switch status {
		case found:
			read[p] = body
		case absent:
			missing = append(missing, report.Finding{Code: report.CodeMissingPage, Message: fmt.Sprintf("%s does not exist at vhco-pro/docs@%s; bump the pin to a revision that has it", p, k.Revision), Path: p})
		default:
			unreachable = append(unreachable, report.Finding{Code: report.CodeUnreachable, Message: msg, Path: p})
		}
	}
	if unreachable != nil {
		return nil, report.Unreachable, unreachable
	}
	if missing != nil {
		return nil, report.MissingPage, missing
	}

	r, err := rules.Parse(read[StandardPage])
	if err != nil {
		var re *rules.Error
		if errors.As(err, &re) {
			return nil, report.Malformed, []report.Finding{{Code: re.Code, Message: re.Message, Path: StandardPage}}
		}
		return nil, report.Malformed, []report.Finding{{Code: report.CodeRulesBlockMissing, Message: err.Error(), Path: StandardPage}}
	}
	k.RulesSchema = r.Schema
	k.FeatureRoot = r.FeatureRoot.Default
	if agents, err := os.ReadFile(filepath.Join(root, "AGENTS.md")); err == nil {
		declared := false
		for line := range strings.Lines(string(agents)) {
			line = strings.TrimRight(line, "\r\n")
			if m := r.Re.Declaration.FindStringSubmatch(line); m != nil && !declared {
				k.FeatureRoot, declared = m[1], true
			}
			if r.Re.LocalFormat.MatchString(line) {
				k.LocalFormat = true
			}
		}
	}
	return &Resolved{Knowledge: k, Root: root, Rules: r, Pages: read, Git: g}, report.Answered, nil
}

func cleanPages(pages []string) ([]string, error) {
	var out []string
	for _, p := range pages {
		if p == "" || path.IsAbs(p) || path.Clean(p) != p || p == ".." || strings.HasPrefix(p, "../") {
			return nil, fmt.Errorf("page %q must be a clean relative path", p)
		}
		out = append(out, p)
	}
	slices.Sort(out)
	return slices.Compact(out), nil
}

// pin reads the repository pin from the bridge files, or falls back to the
// plugin pin. Findings are returned for an invalid pin.
func pin(root, pluginPin string) (report.Knowledge, []report.Finding) {
	refs := map[string][]string{}
	var files []string
	for _, b := range bridges {
		data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(b)))
		if err != nil {
			continue
		}
		matched := false
		for _, m := range pinLink.FindAllStringSubmatch(string(data), -1) {
			if !slices.Contains(refs[m[1]], b) {
				refs[m[1]] = append(refs[m[1]], b)
			}
			matched = true
		}
		if matched {
			files = append(files, b)
		}
	}
	if len(refs) == 0 {
		return report.Knowledge{Revision: pluginPin, Source: "plugin"}, nil
	}
	keys := make([]string, 0, len(refs))
	for k := range refs {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	if len(keys) > 1 {
		var parts []string
		for _, k := range keys {
			parts = append(parts, fmt.Sprintf("%s (%s)", k, strings.Join(refs[k], ", ")))
		}
		return report.Knowledge{}, []report.Finding{{Code: report.CodeInvalidPin, Message: "the repository pins several vhco-pro/docs revisions: " + strings.Join(parts, "; ")}}
	}
	if !fullSHA.MatchString(keys[0]) {
		return report.Knowledge{}, []report.Finding{{Code: report.CodeInvalidPin, Message: fmt.Sprintf("the repository pins vhco-pro/docs at %q (%s), which is not a full 40-character SHA", keys[0], strings.Join(refs[keys[0]], ", "))}}
	}
	return report.Knowledge{Revision: keys[0], Source: "repository", PinFiles: files}, nil
}

type fetchStatus int

const (
	found fetchStatus = iota
	absent
	failed
)

type fetcher struct {
	revision string
	offline  bool
	source   string
	cacheDir string
}

func (f fetcher) fetch(ctx context.Context, page string) ([]byte, fetchStatus, string) {
	if f.source != "" {
		return f.fromSource(ctx, page)
	}
	cached := filepath.Join(f.cacheDir, "vh-adlc", "docs", f.revision, filepath.FromSlash(page))
	if body, err := os.ReadFile(cached); err == nil {
		return body, found, ""
	}
	if f.offline {
		return nil, failed, fmt.Sprintf("%s at vhco-pro/docs@%s is not in the cache and --offline forbids the network", page, f.revision)
	}
	url := BaseURL + "/vhco-pro/docs/" + f.revision + "/" + page
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, failed, fmt.Sprintf("reading %s: %v", page, err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, failed, fmt.Sprintf("vhco-pro/docs is unreachable reading %s at %s", page, f.revision)
	}
	defer func() { _ = resp.Body.Close() }()
	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		return nil, absent, ""
	default:
		return nil, failed, fmt.Sprintf("vhco-pro/docs answered %d reading %s at %s", resp.StatusCode, page, f.revision)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, failed, fmt.Sprintf("vhco-pro/docs is unreachable reading %s at %s", page, f.revision)
	}
	if err := store(cached, body); err != nil {
		return nil, failed, fmt.Sprintf("caching %s: %v", page, err)
	}
	return body, found, ""
}

func (f fetcher) fromSource(ctx context.Context, page string) ([]byte, fetchStatus, string) {
	g := gitcmd.Git{Dir: f.source}
	if _, err := g.Run(ctx, "cat-file", "-e", f.revision+"^{commit}"); err != nil {
		return nil, failed, fmt.Sprintf("the docs source has no commit %s", f.revision)
	}
	body, err := g.Run(ctx, "show", f.revision+":"+page)
	if err != nil {
		if gitcmd.ExitCode(err) == 128 {
			return nil, absent, ""
		}
		return nil, failed, fmt.Sprintf("reading %s from the docs source: %v", page, err)
	}
	return body, found, ""
}

// store writes the page to a temporary file beside its cache path and renames
// it into place, so a reader never sees a partial page.
func store(dst string, body []byte) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(dst), ".page-*")
	if err != nil {
		return err
	}
	if _, err := tmp.Write(body); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmp.Name())
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmp.Name())
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o644); err != nil {
		_ = os.Remove(tmp.Name())
		return err
	}
	return os.Rename(tmp.Name(), dst)
}

type pagesData struct {
	Pages []string `json:"pages"`
}

// Command answers vh-adlc knowledge.
func Command(ctx context.Context, o Options) *report.Report {
	res, result, findings := Resolve(ctx, o)
	rep := report.New("knowledge", result, findings...)
	if res == nil {
		return rep
	}
	pages, _ := cleanPages(o.Pages)
	if pages == nil {
		pages = []string{}
	}
	rep.Knowledge = &res.Knowledge
	rep.Data = pagesData{Pages: pages}
	return rep
}
