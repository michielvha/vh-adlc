package clean

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/internal/report"
)

const envManifest = "schema_version: 1\nproject: example\ntemp_root: {max_age: 24h}\n"

func (d hostDirs) writeManifest(t *testing.T, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(d.repo, ".vh-adlc"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(d.repo, ManifestPath), []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func (d hostDirs) env() EnvOptions {
	return EnvOptions{Repo: d.repo, Host: HostPaths{ConfigDir: d.config, Home: d.home, Tmp: d.tmp, UID: os.Getuid()}, GOOS: "linux"}
}

func envData(t *testing.T, rep *report.Report) EnvData {
	t.Helper()
	data, ok := rep.Data.(EnvData)
	if !ok {
		t.Fatalf("data is %T: %+v", rep.Data, rep)
	}
	return data
}

func TestEnvCreatesTheRoot(t *testing.T) {
	d := newHostDirs(t)
	d.writeManifest(t, envManifest)
	base := filepath.Join(d.home, ".cache", "vh tmp's")
	d.writeHost(t, "temp_base: \""+base+"\"\n")

	rep := Env(d.env())
	if rep.Result != report.Answered || rep.Knowledge != nil || len(rep.Findings) != 0 {
		t.Fatalf("env: %+v", rep)
	}
	data := envData(t, rep)
	root := filepath.Join(base, "example")
	if data.TempRoot != root || data.TMPDIR != root || data.GOTMPDIR != root {
		t.Fatalf("data: %+v, want %s", data, root)
	}
	for _, dir := range []string{base, root} {
		info, err := os.Lstat(dir)
		if err != nil || !info.IsDir() || info.Mode().Perm() != 0o700 {
			t.Fatalf("%s: %v, %v", dir, info, err)
		}
	}

	// A base removed, as by a reboot, is recreated, and a root left with a
	// wider mode goes back to 0700.
	if err := os.RemoveAll(base); err != nil {
		t.Fatal(err)
	}
	if rep := Env(d.env()); rep.Result != report.Answered {
		t.Fatalf("env after the base was removed: %+v", rep)
	}
	if err := os.Chmod(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if rep := Env(d.env()); rep.Result != report.Answered {
		t.Fatalf("env on a 0755 root: %+v", rep)
	}
	if info, err := os.Stat(root); err != nil || info.Mode().Perm() != 0o700 {
		t.Fatalf("root mode: %v, %v", info, err)
	}
}

// TestEnvShellLines evaluates the --sh lines in a shell, so a space and a
// quote in the path must survive.
func TestEnvShellLines(t *testing.T) {
	data := EnvData{TempRoot: "/x/it's a dir", TMPDIR: "/x/it's a dir", GOTMPDIR: "/x/it's a dir"}
	lines := ShellLines(data)
	if strings.Count(lines, "\n") != 2 || !strings.HasPrefix(lines, "export TMPDIR=") {
		t.Fatalf("lines: %q", lines)
	}
	out, err := exec.Command("sh", "-c", lines+`printf '%s\n%s' "$TMPDIR" "$GOTMPDIR"`).Output()
	if err != nil || string(out) != "/x/it's a dir\n/x/it's a dir" {
		t.Fatalf("sh read %q, %v", out, err)
	}
	b, err := json.Marshal(data)
	if err != nil || !strings.Contains(string(b), `"TMPDIR"`) || !strings.Contains(string(b), `"GOTMPDIR"`) {
		t.Fatalf("json: %s, %v", b, err)
	}
}

func TestEnvFailuresCreateNothing(t *testing.T) {
	cases := []struct {
		name     string
		manifest string // "" leaves the manifest out
		host     string
		prepare  func(t *testing.T, d hostDirs, base string)
		code     string
		result   report.Result
		goos     string
	}{
		{name: "no manifest", host: "temp_base: BASE\n", code: report.CodeManifestMissing, result: report.Fail},
		{name: "invalid manifest", manifest: "schema_version: 1\nproject: ../x\ntemp_root: {max_age: 24h}\n", host: "temp_base: BASE\n", code: report.CodeManifestInvalid, result: report.Fail},
		{name: "second document", manifest: envManifest + "---\nproject: other\n", host: "temp_base: BASE\n", code: report.CodeManifestInvalid, result: report.Fail},
		{name: "no temp_root", manifest: "schema_version: 1\nproject: example\n", host: "temp_base: BASE\n", code: report.CodeTempRootUndeclared, result: report.Fail},
		{name: "relative base", manifest: envManifest, host: "temp_base: rel/base\n", code: report.CodeHostSettingsInvalid, result: report.Fail},
		{
			name: "symlinked base", manifest: envManifest, host: "temp_base: BASE\n", code: report.CodeTempBaseRefused, result: report.Fail,
			prepare: func(t *testing.T, d hostDirs, base string) {
				target := filepath.Join(d.home, "target")
				if err := os.Mkdir(target, 0o700); err != nil {
					t.Fatal(err)
				}
				if err := os.MkdirAll(filepath.Dir(base), 0o755); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(target, base); err != nil {
					t.Fatal(err)
				}
			},
		},
		{name: "not linux", manifest: envManifest, host: "temp_base: BASE\n", code: report.CodeUnsupportedPlatform, result: report.Error, goos: "darwin"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d := newHostDirs(t)
			base := filepath.Join(d.home, ".cache", "vh-tmp")
			if c.manifest != "" {
				d.writeManifest(t, c.manifest)
			}
			d.writeHost(t, strings.ReplaceAll(c.host, "BASE", base))
			if c.prepare != nil {
				c.prepare(t, d, base)
			}
			before := snapshot(t, d.home)
			o := d.env()
			if c.goos != "" {
				o.GOOS = c.goos
			}
			rep := Env(o)
			if rep.Result != c.result || len(rep.Findings) != 1 || rep.Findings[0].Code != c.code || rep.Data != nil {
				t.Fatalf("got %+v; want %s with %s", rep, c.result, c.code)
			}
			if after := snapshot(t, d.home); after != before {
				t.Fatalf("env changed the home:\nbefore %s\nafter  %s", before, after)
			}
		})
	}
}
