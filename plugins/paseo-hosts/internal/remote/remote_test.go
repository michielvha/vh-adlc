//go:build unix

package remote_test

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/remote"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/testenv"
)

func TestMain(m *testing.M) { testenv.Main(m) }

func TestCallPastItsDeadlineTimesOut(t *testing.T) {
	dir := t.TempDir()
	pidFile := filepath.Join(dir, "pid")
	ssh := "#!/bin/sh\necho $$ > '" + pidFile + "'\nexec sleep 600\n"
	if err := os.WriteFile(filepath.Join(dir, "ssh"), []byte(ssh), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	start := time.Now()
	_, err := remote.Bash(remote.WithDeadline(ctx, 500*time.Millisecond), "client", "true", nil)
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Fatalf("the call took %s", elapsed)
	}
	var to *remote.Timeout
	if !errors.As(err, &to) || errors.Is(err, remote.ErrUnreachable) || !strings.Contains(err.Error(), "timed out after 500ms") {
		t.Fatalf("error %v is not a timeout after 500ms", err)
	}
	data, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatal(err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		t.Fatal(err)
	}
	if err := syscall.Kill(pid, 0); err == nil {
		t.Fatalf("the stand-in ssh %d still runs", pid)
	}
}

func TestBootstrapIsTheFixedCommand(t *testing.T) {
	if remote.Bootstrap != testenv.Bootstrap {
		t.Fatalf("bootstrap\n%s\nwant\n%s", remote.Bootstrap, testenv.Bootstrap)
	}
}

func TestPowerShellScriptThatThrowsExitsOne(t *testing.T) {
	testenv.RequirePwsh(t)
	e := testenv.New(t)
	e.Client("pc", testenv.Windows)
	cmd := exec.Command("ssh", "pc", testenv.Bootstrap)
	cmd.Stdin = strings.NewReader("Write-Output 'before'\nthrow 'boom'\nWrite-Output 'after'\n")
	var stdout, stderr strings.Builder
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	var ee *exec.ExitError
	if !errors.As(err, &ee) || ee.ExitCode() != 1 {
		t.Fatalf("exit %v, stderr %q", err, stderr.String())
	}
	if stdout.String() != "before\n" || strings.TrimSpace(stderr.String()) != "boom" {
		t.Fatalf("stdout %q, stderr %q", stdout.String(), stderr.String())
	}
}

func TestPowerShellWarningLeavesStandardErrorEmpty(t *testing.T) {
	testenv.RequirePwsh(t)
	e := testenv.New(t)
	e.Client("pc", testenv.Windows)
	cmd := exec.Command("ssh", "pc", testenv.Bootstrap)
	cmd.Stdin = strings.NewReader("Write-Warning 'careful'\nWrite-Output 'DONE=1'\n")
	var stdout, stderr strings.Builder
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		t.Fatalf("%v: %s", err, stderr.String())
	}
	if stdout.String() != "DONE=1\n" || stderr.String() != "" {
		t.Fatalf("stdout %q, stderr %q", stdout.String(), stderr.String())
	}
}
