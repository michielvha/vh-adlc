package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/testrepo"
)

// requireBwrap is set by the checker CI job, which installs Bubblewrap, so a
// missing bwrap fails there instead of skipping.
const requireBwrap = "VH_ADLC_REQUIRE_BWRAP"

// bwrapOrSkip returns the bwrap path once a probe sandbox has run.
func bwrapOrSkip(t *testing.T) string {
	t.Helper()
	missing := func(format string, a ...any) string {
		t.Helper()
		if os.Getenv(requireBwrap) == "1" {
			t.Fatalf(format, a...)
		}
		t.Skipf(format, a...)
		return ""
	}
	if runtime.GOOS != "linux" {
		return missing("Bubblewrap needs Linux, not %s", runtime.GOOS)
	}
	path, err := exec.LookPath("bwrap")
	if err != nil {
		return missing("bwrap is not on PATH: %v", err)
	}
	if out, err := exec.Command(path, "--ro-bind", "/", "/", "--dev", "/dev", "--tmpfs", "/tmp", "true").CombinedOutput(); err != nil {
		return missing("bwrap cannot start a sandbox: %v: %s", err, out)
	}
	return path
}

// sandboxRun runs a script under Bubblewrap with the host read-only, a
// size-limited tmpfs at /tmp, and the binary, the repository and the home
// bound under /mnt. Nothing the script does reaches the host's /tmp.
func sandboxRun(t *testing.T, bwrap string, newPIDNamespace bool, script string) []byte {
	t.Helper()
	repo := testrepo.New(t)
	repo.Write("README.md", "fixture\n")
	repo.Commit("fixture")
	repo.AddRemote()
	args := []string{"--ro-bind", "/", "/", "--dev", "/dev"}
	if newPIDNamespace {
		args = append(args, "--unshare-pid", "--proc", "/proc")
	} else {
		args = append(args, "--bind", "/proc", "/proc")
	}
	args = append(args,
		"--size", "4194304", "--tmpfs", "/tmp",
		"--tmpfs", "/mnt",
		"--ro-bind", binary, "/mnt/vh-adlc",
		"--ro-bind", repo.Dir, "/mnt/repo",
		"--ro-bind", repo.Home, "/mnt/home",
		"--setenv", "HOME", "/mnt/home",
		"--setenv", "XDG_CONFIG_HOME", "/mnt/home/.config",
		"--setenv", "XDG_CACHE_HOME", "/mnt/home/cache",
		"--setenv", "DOCKER_HOST", "unix:///mnt/absent.sock",
		"--setenv", "GIT_CONFIG_GLOBAL", "/dev/null",
		"--setenv", "GIT_CONFIG_NOSYSTEM", "1",
		"--unsetenv", "TMPDIR",
		"sh", "-c", script,
	)
	cmd := exec.Command(bwrap, args...)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	if err := cmd.Run(); err != nil {
		t.Fatalf("sandbox: %v\nstdout %s\nstderr %s", err, out.String(), errb.String())
	}
	return out.Bytes()
}

// oldEntry is shell that creates /tmp/go-build1 holding a 1 MiB file, both
// dated two days back.
func oldEntry() string {
	at := time.Now().Add(-48 * time.Hour).Unix()
	return fmt.Sprintf("mkdir /tmp/go-build1 && head -c 1048576 /dev/zero > /tmp/go-build1/blob && touch -d @%d /tmp/go-build1/blob /tmp/go-build1\n", at)
}

func sandboxReport(t *testing.T, out []byte) (report.Result, []string, map[string]json.RawMessage, string) {
	t.Helper()
	text := string(out)
	start, end := strings.Index(text, "REPORT<"), strings.Index(text, ">REPORT")
	if start < 0 || end < start {
		t.Fatalf("no report in %s", out)
	}
	var rep struct {
		Result   report.Result              `json:"result"`
		Findings []report.Finding           `json:"findings"`
		Data     map[string]json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal([]byte(text[start+len("REPORT<"):end]), &rep); err != nil {
		t.Fatalf("report: %v\n%s", err, out)
	}
	var codes []string
	for _, f := range rep.Findings {
		codes = append(codes, f.Code)
	}
	return rep.Result, codes, rep.Data, text[end+len(">REPORT"):]
}

// TestCleanRefusesInAPIDNamespace is AC-07: the real binary in a new PID
// namespace reports pid-namespace and removes nothing.
func TestCleanRefusesInAPIDNamespace(t *testing.T) {
	bwrap := bwrapOrSkip(t)
	out := sandboxRun(t, bwrap, true, oldEntry()+
		"printf 'REPORT<'; /mnt/vh-adlc clean --repo /mnt/repo; printf '>REPORT'; ls /tmp\n")
	result, codes, _, after := sandboxReport(t, out)
	if result != report.Error || len(codes) != 1 || codes[0] != report.CodePIDNamespace {
		t.Fatalf("result %s, codes %v; want error with pid-namespace", result, codes)
	}
	if strings.TrimSpace(after) != "go-build1" {
		t.Fatalf("/tmp after the run: %q", after)
	}
}

// TestCleanFreesAFullTmp is AC-18: with the /tmp tmpfs full, an applied run in
// the initial PID namespace frees space and writes nothing to /tmp.
func TestCleanFreesAFullTmp(t *testing.T) {
	bwrap := bwrapOrSkip(t)
	script := oldEntry() +
		"mkdir /tmp/unrelated && (head -c 8388608 /dev/zero > /tmp/unrelated/fill 2>/dev/null || true)\n" +
		"if printf x > /tmp/probe 2>/dev/null; then echo NOT-FULL; fi; rm -f /tmp/probe\n" +
		"before=$(df -k --output=avail /tmp | tail -1)\n" +
		"printf 'REPORT<'; /mnt/vh-adlc clean --repo /mnt/repo; printf '>REPORT'\n" +
		"after=$(df -k --output=avail /tmp | tail -1)\n" +
		"echo \"AVAIL $before $after\"; ls -A /tmp\n"
	out := sandboxRun(t, bwrap, false, script)
	if strings.Contains(string(out), "NOT-FULL") {
		t.Fatalf("the sandbox /tmp was not full:\n%s", out)
	}
	result, codes, data, after := sandboxReport(t, out)
	if result != report.Pass || strings.Join(codes, " ") != report.CodeEngineAbsent+" "+report.CodeManifestMissing {
		t.Fatalf("result %s, codes %v; want pass with the engine-absent and manifest-missing notes\n%s", result, codes, out)
	}
	var freed int64
	if err := json.Unmarshal(data["freed_bytes"], &freed); err != nil || freed < 1<<20 {
		t.Fatalf("freed_bytes %s", data["freed_bytes"])
	}
	var before, afterKB int
	lines := strings.Split(strings.TrimSpace(after), "\n")
	if _, err := fmt.Sscanf(lines[0], "AVAIL %d %d", &before, &afterKB); err != nil || afterKB-before < 1024 {
		t.Fatalf("available space %q: %v", lines[0], err)
	}
	if rest := strings.Join(lines[1:], " "); rest != "unrelated" {
		t.Fatalf("/tmp after the run holds %q; want only the unmatched entry", rest)
	}
}
