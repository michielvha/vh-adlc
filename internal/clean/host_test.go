package clean

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/michielvha/vh-adlc/internal/report"
)

// hostDirs lays out a temporary home with a config directory, a repository
// and a stand-in for /tmp.
type hostDirs struct {
	home, config, repo, tmp string
}

func newHostDirs(t *testing.T) hostDirs {
	t.Helper()
	root := t.TempDir()
	d := hostDirs{
		home:   filepath.Join(root, "home"),
		config: filepath.Join(root, "home", ".config"),
		repo:   filepath.Join(root, "home", "code", "repo"),
		tmp:    filepath.Join(root, "tmp"),
	}
	for _, dir := range []string{d.config, filepath.Join(d.repo, ".git"), filepath.Join(d.home, ".git"), d.tmp} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	// The repository's .git holds HEAD; the home's is an empty directory,
	// as on the development host, and does not make a work tree.
	if err := os.WriteFile(filepath.Join(d.repo, ".git", "HEAD"), []byte("ref: refs/heads/main\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return d
}

func (d hostDirs) writeHost(t *testing.T, text string) {
	t.Helper()
	dir := filepath.Join(d.config, "vh-adlc")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "host.yaml"), []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
}

func (d hostDirs) load(t *testing.T) (string, error) {
	t.Helper()
	return LoadTempBase(HostPaths{ConfigDir: d.config, Home: d.home, Tmp: d.tmp, UID: os.Getuid()}, d.repo)
}

func codeOf(err error) string {
	var c *CodedError
	if errors.As(err, &c) {
		return c.Code
	}
	return ""
}

func TestTempBaseDefault(t *testing.T) {
	d := newHostDirs(t)
	base, err := d.load(t)
	want := filepath.Join(d.tmp, "vh-adlc-"+itoa(os.Getuid()))
	if err != nil || base != want {
		t.Fatalf("no host.yaml: %q, %v; want %q", base, err, want)
	}
	d.writeHost(t, "temp_base: "+filepath.Join(d.home, ".cache", "vh-tmp")+"\n")
	base, err = d.load(t)
	if err != nil || base != filepath.Join(d.home, ".cache", "vh-tmp") {
		t.Fatalf("a set temp_base: %q, %v", base, err)
	}
}

func TestHostSettingsInvalid(t *testing.T) {
	d := newHostDirs(t)
	linked := filepath.Join(d.home, "code", "linked")
	if err := os.MkdirAll(linked, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(linked, ".git"), []byte("gitdir: /elsewhere/.git/worktrees/linked\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	cases := map[string]string{
		"relative":             "temp_base: tmp/vh\n",
		"tilde":                "temp_base: ~/tmp\n",
		"home itself":          "temp_base: " + d.home + "\n",
		"home with a slash":    "temp_base: " + d.home + "/\n",
		"the repository":       "temp_base: " + d.repo + "\n",
		"inside the work tree": "temp_base: " + filepath.Join(d.repo, "build", "tmp") + "\n",
		"above the repository": "temp_base: " + filepath.Join(d.home, "code") + "\n",
		"in a linked worktree": "temp_base: " + filepath.Join(linked, "tmp") + "\n",
		"the root":             "temp_base: /\n",
		"empty value":          "temp_base: \"\"\n",
		"unknown key":          "temp_base: /var/tmp/x\nextra: 1\n",
		"not a string":         "temp_base: 3\n",
		"two documents":        "temp_base: /var/tmp/x\n---\ntemp_base: /var/tmp/y\n",
		"anchor":               "temp_base: &a /var/tmp/x\n",
		"empty file":           "",
	}
	for name, text := range cases {
		t.Run(name, func(t *testing.T) {
			d.writeHost(t, text)
			base, err := d.load(t)
			if codeOf(err) != report.CodeHostSettingsInvalid {
				t.Fatalf("got %q, %v; want %s", base, err, report.CodeHostSettingsInvalid)
			}
		})
	}
}

func TestCheckBase(t *testing.T) {
	root := t.TempDir()
	uid := os.Getuid()
	missing := filepath.Join(root, "missing")
	if exists, err := CheckBase(missing, uid); err != nil || exists {
		t.Fatalf("a missing base: %v, %v", exists, err)
	}
	good := filepath.Join(root, "good")
	if err := os.Mkdir(good, 0o700); err != nil {
		t.Fatal(err)
	}
	if exists, err := CheckBase(good, uid); err != nil || !exists {
		t.Fatalf("a good base: %v, %v", exists, err)
	}
	link := filepath.Join(root, "link")
	if err := os.Symlink(good, link); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(root, "file")
	if err := os.WriteFile(file, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	open := filepath.Join(root, "open")
	if err := os.Mkdir(open, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(open, 0o777); err != nil {
		t.Fatal(err)
	}
	for name, base := range map[string]string{"symlink": link, "file": file, "world-writable": open} {
		if _, err := CheckBase(base, uid); codeOf(err) != report.CodeTempBaseRefused {
			t.Errorf("%s: %v; want %s", name, err, report.CodeTempBaseRefused)
		}
	}
	if _, err := CheckBase(good, uid+1); codeOf(err) != report.CodeTempBaseRefused {
		t.Errorf("a foreign base: %v; want %s", err, report.CodeTempBaseRefused)
	}
}
