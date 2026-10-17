// Package testrepo builds fixture Git repositories for tests. It runs git
// with the user's configuration replaced and fixed identities and dates, so a
// fixture built twice has the same commit SHAs on any machine.
package testrepo

import (
	"embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

//go:embed testdata
var files embed.FS

// Standard returns the pinned feature-document standard used by fixtures.
func Standard() string {
	b, err := files.ReadFile("testdata/docs/feature-documents.md")
	if err != nil {
		panic(err)
	}
	return string(b)
}

// File returns a file from the package's testdata directory.
func File(name string) string {
	b, err := files.ReadFile("testdata/" + name)
	if err != nil {
		panic(err)
	}
	return string(b)
}

const epoch = 1767225600 // 2026-01-01T00:00:00Z

// Env returns a clean environment for git and the binary: inherited GIT_*
// variables are removed, the global and system Git configuration are
// replaced, and HOME and the cache directory point at home.
func Env(home string) []string {
	var env []string
	for _, kv := range os.Environ() {
		k, _, _ := strings.Cut(kv, "=")
		if strings.HasPrefix(k, "GIT_") || k == "HOME" || k == "XDG_CACHE_HOME" {
			continue
		}
		env = append(env, kv)
	}
	return append(env,
		"GIT_CONFIG_GLOBAL="+os.DevNull,
		"GIT_CONFIG_NOSYSTEM=1",
		"HOME="+home,
		"XDG_CACHE_HOME="+filepath.Join(home, "cache"),
		"LC_ALL=C",
	)
}

// Repo is a fixture repository.
type Repo struct {
	t    testing.TB
	Dir  string
	Home string
	tick int
}

// New creates an empty repository on branch main.
func New(t testing.TB) *Repo {
	t.Helper()
	r := &Repo{t: t, Dir: t.TempDir(), Home: t.TempDir()}
	r.Git("init", "-q", "-b", "main", "--object-format=sha1")
	r.Git("config", "init.defaultBranch", "main")
	r.Git("config", "user.name", "Fixture")
	r.Git("config", "user.email", "fixture@example.com")
	r.Git("config", "commit.gpgsign", "false")
	return r
}

// Git runs git in the repository and returns its trimmed output.
func (r *Repo) Git(args ...string) string {
	r.t.Helper()
	return run(r.t, r.Dir, r.Home, r.env(), args...)
}

func (r *Repo) env() []string {
	date := fmt.Sprintf("@%d +0000", epoch+r.tick*60)
	return append(Env(r.Home), "GIT_AUTHOR_DATE="+date, "GIT_COMMITTER_DATE="+date)
}

func run(t testing.TB, dir, home string, env []string, args ...string) string {
	t.Helper()
	if env == nil {
		env = Env(home)
	}
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = env
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return strings.TrimSpace(string(out))
}

// Write writes a file, creating its directories.
func (r *Repo) Write(path, content string) {
	r.t.Helper()
	full := filepath.Join(r.Dir, path)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		r.t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		r.t.Fatal(err)
	}
}

// Remove deletes a file.
func (r *Repo) Remove(path string) {
	r.t.Helper()
	if err := os.Remove(filepath.Join(r.Dir, path)); err != nil {
		r.t.Fatal(err)
	}
}

// Commit stages everything and commits it with the next fixed date. It
// returns the new commit's SHA.
func (r *Repo) Commit(message string) string {
	r.t.Helper()
	r.tick++
	r.Git("add", "-A")
	r.Git("commit", "-q", "--allow-empty", "-m", message)
	return r.Git("rev-parse", "HEAD")
}

// AddRemote creates a bare repository, adds it as origin, pushes main and
// points origin's HEAD at main.
func (r *Repo) AddRemote() string {
	r.t.Helper()
	bare := r.t.TempDir()
	run(r.t, bare, r.Home, nil, "init", "-q", "--bare", "-b", "main", "--object-format=sha1")
	r.Git("remote", "add", "origin", bare)
	r.Git("push", "-q", "origin", "main")
	r.Git("remote", "set-head", "origin", "main")
	return bare
}

// DocsRepo builds a docs repository with one commit per standard page
// version, each holding conventions/feature-documents.md and the extra pages
// given for it, and returns its directory and the commit SHAs in order.
func DocsRepo(t testing.TB, versions ...map[string]string) (string, []string) {
	t.Helper()
	r := New(t)
	var shas []string
	for i, pages := range versions {
		for path, content := range pages {
			r.Write(path, content)
		}
		shas = append(shas, r.Commit(fmt.Sprintf("docs revision %d", i+1)))
	}
	return r.Dir, shas
}
