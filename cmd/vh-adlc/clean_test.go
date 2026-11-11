package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/testrepo"
)

const fixtureManifest = "schema_version: 1\nproject: fixture\ntemp_root: {max_age: 24h}\n"

// hostHome is a temporary home whose host.yaml moves the temp base out of
// /tmp, so no test writes there.
func hostHome(t *testing.T, base string) string {
	t.Helper()
	home := t.TempDir()
	dir := filepath.Join(home, ".config", "vh-adlc")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "host.yaml"), []byte("temp_base: \""+base+"\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return home
}

func runIn(t *testing.T, home string, args ...string) (stdout, stderr []byte, exit int) {
	t.Helper()
	cmd := exec.Command(binary, args...)
	cmd.Env = append(testrepo.Env(home), "XDG_CONFIG_HOME="+filepath.Join(home, ".config"))
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	err := cmd.Run()
	if ee, ok := err.(*exec.ExitError); ok {
		return out.Bytes(), errb.Bytes(), ee.ExitCode()
	} else if err != nil {
		t.Fatal(err)
	}
	return out.Bytes(), errb.Bytes(), 0
}

// TestEnvPointsGoTestAtTheRoot is AC-01: a go test run under env --sh keeps
// its temp files, its build directory included, under the project's root.
func TestEnvPointsGoTestAtTheRoot(t *testing.T) {
	repo := t.TempDir()
	base := filepath.Join(t.TempDir(), "base with 'quote")
	home := hostHome(t, base)
	files := map[string]string{
		".vh-adlc/cleanup.yaml": fixtureManifest,
		"go.mod":                "module fixture\n\ngo 1.24\n",
		"fixture_test.go": `package fixture

import (
	"os"
	"testing"
)

func TestTemp(t *testing.T) {
	f, err := os.CreateTemp("", "probe-")
	if err != nil {
		t.Fatal(err)
	}
	_ = f.Close()
	t.Logf("TEMPDIR=%s", t.TempDir())
	t.Logf("CREATETEMP=%s", f.Name())
	t.Logf("OSTEMP=%s", os.TempDir())
}
`,
	}
	for name, text := range files {
		if err := os.MkdirAll(filepath.Dir(filepath.Join(repo, name)), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(repo, name), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	stdout, stderr, exit := runIn(t, home, "env", "--repo", repo, "--sh")
	if exit != 0 || len(stderr) != 0 {
		t.Fatalf("env --sh: exit %d, stderr %s", exit, stderr)
	}
	root := filepath.Join(base, "fixture")
	info, err := os.Stat(root)
	if err != nil || info.Mode().Perm() != 0o700 {
		t.Fatalf("root %s: %v, %v", root, info, err)
	}
	script := string(stdout) + "cd \"$1\" && exec go test -count=1 -v -work ./...\n"
	cmd := exec.Command("sh", "-c", script, "sh", repo)
	cmd.Env = testrepo.Env(home)
	for _, kv := range os.Environ() {
		if strings.HasPrefix(kv, "PATH=") || strings.HasPrefix(kv, "GOCACHE=") || strings.HasPrefix(kv, "GOMODCACHE=") || strings.HasPrefix(kv, "GOPATH=") {
			cmd.Env = append(cmd.Env, kv)
		}
	}
	cache, _ := os.UserCacheDir()
	cmd.Env = append(cmd.Env, "GOFLAGS=-mod=mod", "GOCACHE="+envOr("GOCACHE", filepath.Join(cache, "go-build")), "GOTOOLCHAIN=local")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("go test: %v\n%s", err, out)
	}
	seen := 0
	sc := bufio.NewScanner(bytes.NewReader(out))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		for _, key := range []string{"WORK=", "TEMPDIR=", "CREATETEMP=", "OSTEMP="} {
			i := strings.Index(line, key)
			if i < 0 {
				continue
			}
			seen++
			if p := line[i+len(key):]; !strings.HasPrefix(p, root) {
				t.Errorf("%s%s is outside the root %s", key, p, root)
			}
		}
	}
	if seen != 4 {
		t.Fatalf("saw %d of the 4 temp paths:\n%s", seen, out)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// TestEnvShFailurePrintsNothing is AC-24: a failing env --sh prints nothing to
// stdout, so an eval of its output changes nothing.
func TestEnvShFailurePrintsNothing(t *testing.T) {
	base := filepath.Join(t.TempDir(), "base")
	home := hostHome(t, base)
	for name, repo := range map[string]string{"no manifest": t.TempDir()} {
		stdout, stderr, exit := runIn(t, home, "env", "--repo", repo, "--sh")
		if len(stdout) != 0 || exit != 1 {
			t.Fatalf("%s: stdout %q, exit %d", name, stdout, exit)
		}
		var rep struct {
			Result   report.Result    `json:"result"`
			Findings []report.Finding `json:"findings"`
		}
		if err := json.Unmarshal(stderr, &rep); err != nil || rep.Result != report.Fail || rep.Findings[0].Code != report.CodeManifestMissing {
			t.Fatalf("%s: stderr %s, %v", name, stderr, err)
		}
		if _, err := os.Lstat(base); !os.IsNotExist(err) {
			t.Fatalf("%s: created the base: %v", name, err)
		}
	}
}

// TestCleanAndEnvIgnorePin holds the exemption: neither reads conventions.
func TestCleanAndEnvIgnorePin(t *testing.T) {
	base := filepath.Join(t.TempDir(), "base")
	home := hostHome(t, base)
	repo := t.TempDir()
	for _, pin := range [][]string{nil, {"--plugin-pin", "not-a-sha"}} {
		stdout, _, exit := runIn(t, home, append([]string{"env", "--repo", repo}, pin...)...)
		var rep struct {
			Result    report.Result   `json:"result"`
			Knowledge json.RawMessage `json:"knowledge"`
		}
		if err := json.Unmarshal(stdout, &rep); err != nil || rep.Result == report.Usage || exit == 2 || string(rep.Knowledge) != "null" {
			t.Fatalf("env %v: %s, exit %d", pin, stdout, exit)
		}
	}
	// A relative temp_base stops clean before it reads /tmp, so this real
	// run, without --dry-run, can remove nothing.
	bad := hostHome(t, "relative/base")
	for _, pin := range [][]string{nil, {"--plugin-pin", "not-a-sha"}} {
		stdout, _, exit := runIn(t, bad, append([]string{"clean", "--repo", repo}, pin...)...)
		var rep struct {
			Result    report.Result    `json:"result"`
			Knowledge json.RawMessage  `json:"knowledge"`
			Findings  []report.Finding `json:"findings"`
		}
		if err := json.Unmarshal(stdout, &rep); err != nil || exit != 1 || string(rep.Knowledge) != "null" ||
			len(rep.Findings) != 1 || rep.Findings[0].Code != report.CodeHostSettingsInvalid {
			t.Fatalf("clean %v: %s, exit %d", pin, stdout, exit)
		}
	}
}

func TestGoldenCleanAndEnv(t *testing.T) {
	repo := t.TempDir()
	bad := hostHome(t, "relative/base")
	for _, c := range []goldenCase{
		{"env-manifest-missing", []string{"env", "--repo", repo}},
		{"clean-host-settings-invalid", []string{"clean", "--repo", repo, "--dry-run"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("XDG_CONFIG_HOME", filepath.Join(bad, ".config"))
			checkGolden(t, bad, "", c)
		})
	}
}
